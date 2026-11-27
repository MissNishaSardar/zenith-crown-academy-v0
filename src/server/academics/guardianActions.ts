"use server";

import { Prisma } from "@generated/prisma/client";

import { can } from "@/lib/auth/permissions";
import {
  documentChecklistSchema,
  documentChecklistType,
  guardianLinkSchema,
  guardianLinkType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

export type GuardianLinkResult =
  | {
      ok: true;
      link: { canViewFees: boolean; id: string; isPrimary: boolean };
    }
  | {
      errors: Partial<
        Record<
          "canViewFees" | "guardianId" | "isPrimary" | "root" | "studentId",
          string
        >
      >;
      ok: false;
    };

export type ChecklistResult =
  | { ok: true; item: { id: string; status: string } }
  | {
      errors: Partial<
        Record<
          "docType" | "label" | "note" | "root" | "status" | "studentId",
          string
        >
      >;
      ok: false;
    };

type LinkErrorMap = Extract<GuardianLinkResult, { ok: false }>["errors"];
type ChecklistErrorMap = Extract<ChecklistResult, { ok: false }>["errors"];

const requirePersonWrite = async (entity: string) => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  // office_staff holds academic:view for read and is explicitly granted
  // person write for front-office data entry. Keep this grant next to the
  // manage-curriculum and system:manage checks so the bypass stays visible.
  const allowed =
    active !== null &&
    (can(active, "academic:manage-curriculum") ||
      active === "office_staff" ||
      can(active, "system:manage"));
  if (!allowed) {
    await logAudit({
      action: "permission-deny",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: {
        active: active ?? null,
        blocked: true,
        permission: "academic:manage-curriculum",
        reason: "office-grant-denied",
      },
      before: null,
      entity,
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  return {
    actor: {
      email: session.user.email,
      id: session.user.id,
      role: session.user.role,
    },
  };
};

const toSafeLink = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of ["canViewFees", "guardianId", "isPrimary", "studentId"]) {
    out[field] = record[field] ?? null;
  }
  return out;
};

const toSafeChecklist = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of ["docType", "label", "note", "status", "studentId"]) {
    const value = record[field];
    out[field] = value instanceof Date ? value.toISOString() : (value ?? null);
  }
  return out;
};

const toLinkFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): LinkErrorMap => {
  const fieldErrors: LinkErrorMap = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof LinkErrorMap;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

const toChecklistFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): ChecklistErrorMap => {
  const fieldErrors: ChecklistErrorMap = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof ChecklistErrorMap;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

const normalizeLabel = (docType: string, value: unknown): string => {
  if (docType !== "CLASS_ITEM") return "";
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 80);
};

const normalizeNote = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 500);
  return trimmed === "" ? null : trimmed;
};

export const upsertGuardianLink = async (
  input: guardianLinkType,
): Promise<GuardianLinkResult> => {
  const { actor } = await requirePersonWrite("guardian-link");
  const parsed = guardianLinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toLinkFieldErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const data = parsed.data;
  const student = await prisma.studentProfile.findUnique({
    where: { id: data.studentId },
  });
  if (!student) {
    return {
      errors: { studentId: "This student no longer exists." },
      ok: false,
    };
  }
  const guardian = await prisma.guardian.findUnique({
    where: { id: data.guardianId },
  });
  if (!guardian) {
    return {
      errors: { guardianId: "This guardian no longer exists." },
      ok: false,
    };
  }
  const existing = await prisma.studentGuardianLink.findUnique({
    where: {
      studentId_guardianId: {
        guardianId: data.guardianId,
        studentId: data.studentId,
      },
    },
  });
  const nextCanViewFees =
    data.canViewFees ??
    (existing ? existing.canViewFees : data.isPrimary === true);
  try {
    const cleared: { id: string }[] = [];
    const row = await prisma.$transaction(async (tx) => {
      if (data.isPrimary === true) {
        const others = await tx.studentGuardianLink.findMany({
          select: { id: true },
          where: {
            isPrimary: true,
            studentId: data.studentId,
          },
        });
        const othersToClear = others.filter((other) => {
          if (!existing) return true;
          return other.id !== existing.id;
        });
        if (othersToClear.length > 0) {
          await tx.studentGuardianLink.updateMany({
            data: { isPrimary: false },
            where: {
              id: { in: othersToClear.map((other) => other.id) },
            },
          });
          cleared.push(...othersToClear);
        }
      }
      if (existing) {
        return tx.studentGuardianLink.update({
          data: {
            canViewFees: nextCanViewFees,
            isPrimary: data.isPrimary,
          },
          where: { id: existing.id },
        });
      }
      return tx.studentGuardianLink.create({
        data: {
          canViewFees: nextCanViewFees,
          guardianId: data.guardianId,
          isPrimary: data.isPrimary,
          studentId: data.studentId,
        },
      });
    });
    if (existing) {
      const minimal = toMinimalAuditChange(
        toSafeLink(existing),
        toSafeLink(row),
      );
      await logAudit({
        action: "update",
        actor,
        after: minimal.after,
        before: minimal.before,
        entity: "guardian-link",
        entityId: row.id,
      });
    } else {
      await logAudit({
        action: "create",
        actor,
        after: toSafeLink(row),
        before: null,
        entity: "guardian-link",
        entityId: row.id,
      });
    }
    for (const clearedRow of cleared) {
      await logAudit({
        action: "update",
        actor,
        after: { isPrimary: false },
        before: { isPrimary: true },
        entity: "guardian-link",
        entityId: clearedRow.id,
      });
    }
    return {
      link: {
        canViewFees: row.canViewFees,
        id: row.id,
        isPrimary: row.isPrimary,
      },
      ok: true,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { errors: { root: "This link already exists." }, ok: false };
    }
    return {
      errors: { root: "Could not save this guardian link. Try again." },
      ok: false,
    };
  }
};

export const setChecklistStatus = async (
  input: documentChecklistType,
): Promise<ChecklistResult> => {
  const { actor } = await requirePersonWrite("document-checklist");
  const parsed = documentChecklistSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toChecklistFieldErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const data = parsed.data;
  const student = await prisma.studentProfile.findUnique({
    where: { id: data.studentId },
  });
  if (!student) {
    return {
      errors: { studentId: "This student no longer exists." },
      ok: false,
    };
  }
  const label = normalizeLabel(data.docType, data.label);
  if (data.docType === "CLASS_ITEM" && label === "") {
    return {
      errors: { label: "Add a label for this class item." },
      ok: false,
    };
  }
  const note = normalizeNote(data.note);
  try {
    const existing = await prisma.documentChecklist.findUnique({
      where: {
        studentId_docType_label: {
          docType: data.docType,
          label,
          studentId: data.studentId,
        },
      },
    });
    if (existing) {
      const before = toSafeChecklist(existing);
      const row = await prisma.documentChecklist.update({
        data: {
          note,
          status: data.status,
          verifiedAt: data.status === "VERIFIED" ? new Date() : null,
          verifiedBy: data.status === "VERIFIED" ? actor.id : null,
        },
        where: { id: existing.id },
      });
      const minimal = toMinimalAuditChange(before, toSafeChecklist(row));
      await logAudit({
        action: "update",
        actor,
        after: minimal.after,
        before: minimal.before,
        entity: "document-checklist",
        entityId: row.id,
      });
      return { item: { id: row.id, status: row.status }, ok: true };
    }
    const row = await prisma.documentChecklist.create({
      data: {
        docType: data.docType,
        label,
        note,
        status: data.status,
        studentId: data.studentId,
        verifiedAt: data.status === "VERIFIED" ? new Date() : null,
        verifiedBy: data.status === "VERIFIED" ? actor.id : null,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeChecklist(row),
      before: null,
      entity: "document-checklist",
      entityId: row.id,
    });
    return { item: { id: row.id, status: row.status }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { root: "This checklist row already exists." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not save this checklist row. Try again." },
      ok: false,
    };
  }
};
