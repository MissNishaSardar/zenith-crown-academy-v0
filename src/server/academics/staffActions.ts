"use server";

import { Prisma } from "@generated/prisma/client";

import { can } from "@/lib/auth/permissions";
import { staffType, staffSchema } from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

export type StaffResult =
  | { ok: true; staff: { id: string; employeeId: string } }
  | {
      errors: Partial<
        Record<
          | "address"
          | "designation"
          | "email"
          | "employeeId"
          | "firstName"
          | "isActive"
          | "joiningDate"
          | "lastName"
          | "phone"
          | "root"
          | "userId"
          | "wardNote"
          | "wardStudentId",
          string
        >
      >;
      ok: false;
    };

type StaffErrorMap = Extract<StaffResult, { ok: false }>["errors"];

const STAFF_ROLES = [
  "teacher",
  "principal",
  "vice_principal",
  "office_staff",
  "administrator",
  "accountant",
  "librarian",
] as const;

const normalizeOptionalId = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const normalizeOptionalEmail = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.toLowerCase();
};

const normalizeOptionalText = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const requirePersonWrite = async () => {
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
      entity: "staff-profile",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  return {
    active,
    actor: {
      email: session.user.email,
      id: session.user.id,
      role: session.user.role,
    },
    session,
  };
};

const toSafeStaff = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "address",
    "designation",
    "email",
    "employeeId",
    "firstName",
    "isActive",
    "joiningDate",
    "lastName",
    "phone",
    "userId",
    "wardNote",
    "wardStudentId",
  ]) {
    const value = record[field];
    out[field] = value instanceof Date ? value.toISOString() : (value ?? null);
  }
  return out;
};

const toFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): StaffErrorMap => {
  const fieldErrors: StaffErrorMap = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof StaffErrorMap;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

const checkStaffUserLink = async (userId: string | null | undefined) => {
  if (!userId) return null;
  const target = await prisma.user.findUnique({
    include: { userRoles: { include: { role: true } } },
    where: { id: userId },
  });
  if (!target) return "Linked user no longer exists.";
  const held = target.userRoles.map((row) => row.role.slug);
  const fallback = target.role
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const combined = [...new Set([...held, ...fallback])];
  if (
    !combined.some((slug) => (STAFF_ROLES as readonly string[]).includes(slug))
  ) {
    return "Linked user must hold a staff role.";
  }
  return null;
};

export const createStaff = async (input: staffType): Promise<StaffResult> => {
  const { actor } = await requirePersonWrite();
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toFieldErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const data = parsed.data;
  const employeeId = data.employeeId.trim();
  const existing = await prisma.staffProfile.findUnique({
    where: { employeeId },
  });
  if (existing) {
    return {
      errors: { employeeId: "This employee ID is already used." },
      ok: false,
    };
  }
  const phone = data.phone.trim();
  const email = normalizeOptionalEmail(data.email) ?? null;
  const userId = normalizeOptionalId(data.userId) ?? null;
  const wardStudentId = normalizeOptionalId(data.wardStudentId) ?? null;
  const wardNote = normalizeOptionalText(data.wardNote) ?? null;
  if (userId) {
    const problem = await checkStaffUserLink(userId);
    if (problem) return { errors: { userId: problem }, ok: false };
    const linked = await prisma.staffProfile.findUnique({ where: { userId } });
    if (linked) {
      return {
        errors: {
          userId: "This login is already linked to another staff record.",
        },
        ok: false,
      };
    }
  }
  if (wardStudentId) {
    const ward = await prisma.studentProfile.findUnique({
      where: { id: wardStudentId },
    });
    if (!ward) {
      return {
        errors: { wardStudentId: "Linked student no longer exists." },
        ok: false,
      };
    }
  }
  const joining = new Date(`${data.joiningDate}T00:00:00`);
  if (Number.isNaN(joining.getTime())) {
    return { errors: { joiningDate: "Pick a valid date." }, ok: false };
  }
  try {
    const row = await prisma.staffProfile.create({
      data: {
        address: data.address.trim(),
        designation: data.designation.trim(),
        email,
        employeeId,
        firstName: data.firstName.trim(),
        isActive: data.isActive,
        joiningDate: joining,
        lastName: data.lastName.trim(),
        phone,
        userId,
        wardDeclaredAt: wardStudentId ? new Date() : null,
        wardDeclaredBy: wardStudentId ? actor.id : null,
        wardNote,
        wardStudentId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeStaff(row),
      before: null,
      entity: "staff-profile",
      entityId: row.id,
    });
    return { ok: true, staff: { employeeId: row.employeeId, id: row.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      if (target.includes("employeeId")) {
        return {
          errors: { employeeId: "This employee ID is already used." },
          ok: false,
        };
      }
      if (target.includes("userId")) {
        return {
          errors: { userId: "This login is already linked." },
          ok: false,
        };
      }
      return {
        errors: { root: "This record already exists." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this staff record. Try again." },
      ok: false,
    };
  }
};

export const updateStaff = async (
  input: staffType & { id: string },
): Promise<StaffResult> => {
  const { actor } = await requirePersonWrite();
  if (!input.id) {
    return { errors: { root: "Missing staff id." }, ok: false };
  }
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toFieldErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const target = await prisma.staffProfile.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return {
      errors: { root: "This staff record no longer exists." },
      ok: false,
    };
  }
  const data = parsed.data;
  const employeeId = data.employeeId.trim();
  const duplicate = await prisma.staffProfile.findFirst({
    where: { employeeId, id: { not: input.id } },
  });
  if (duplicate) {
    return {
      errors: { employeeId: "This employee ID is already used." },
      ok: false,
    };
  }
  const phone = data.phone.trim();
  const email = normalizeOptionalEmail(data.email) ?? null;
  const joining = new Date(`${data.joiningDate}T00:00:00`);
  if (Number.isNaN(joining.getTime())) {
    return { errors: { joiningDate: "Pick a valid date." }, ok: false };
  }
  let nextUserId: string | null | undefined;
  if (data.userId === undefined) {
    nextUserId = target.userId;
  } else {
    nextUserId = normalizeOptionalId(data.userId) ?? null;
  }
  if (nextUserId && nextUserId !== target.userId) {
    const problem = await checkStaffUserLink(nextUserId);
    if (problem) return { errors: { userId: problem }, ok: false };
    const linked = await prisma.staffProfile.findFirst({
      where: { id: { not: input.id }, userId: nextUserId },
    });
    if (linked) {
      return {
        errors: {
          userId: "This login is already linked to another staff record.",
        },
        ok: false,
      };
    }
  }
  let nextWardId: string | null | undefined;
  let nextWardNote: string | null | undefined;
  let nextDeclaredBy: string | null | undefined;
  let nextDeclaredAt: Date | null | undefined;
  if (data.wardStudentId === undefined) {
    nextWardId = target.wardStudentId;
    nextWardNote =
      data.wardNote === undefined ?
        target.wardNote
      : (normalizeOptionalText(data.wardNote) ?? null);
    nextDeclaredBy = target.wardDeclaredBy;
    nextDeclaredAt = target.wardDeclaredAt;
  } else {
    nextWardId = normalizeOptionalId(data.wardStudentId) ?? null;
    nextWardNote = normalizeOptionalText(data.wardNote) ?? null;
    if (nextWardId && nextWardId !== target.wardStudentId) {
      const ward = await prisma.studentProfile.findUnique({
        where: { id: nextWardId },
      });
      if (!ward) {
        return {
          errors: { wardStudentId: "Linked student no longer exists." },
          ok: false,
        };
      }
      nextDeclaredBy = actor.id;
      nextDeclaredAt = new Date();
    } else if (!nextWardId) {
      nextDeclaredBy = null;
      nextDeclaredAt = null;
    } else {
      nextDeclaredBy = target.wardDeclaredBy;
      nextDeclaredAt = target.wardDeclaredAt;
    }
  }
  try {
    const before = toSafeStaff(target);
    const row = await prisma.staffProfile.update({
      data: {
        address: data.address.trim(),
        designation: data.designation.trim(),
        email,
        employeeId,
        firstName: data.firstName.trim(),
        isActive: data.isActive,
        joiningDate: joining,
        lastName: data.lastName.trim(),
        phone,
        userId: nextUserId,
        wardDeclaredAt: nextDeclaredAt,
        wardDeclaredBy: nextDeclaredBy,
        wardNote: nextWardNote,
        wardStudentId: nextWardId,
      },
      where: { id: input.id },
    });
    const minimal = toMinimalAuditChange(before, toSafeStaff(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "staff-profile",
      entityId: row.id,
    });
    return { ok: true, staff: { employeeId: row.employeeId, id: row.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const targetError = String(error.meta?.target ?? "");
      if (targetError.includes("employeeId")) {
        return {
          errors: { employeeId: "This employee ID is already used." },
          ok: false,
        };
      }
      if (targetError.includes("userId")) {
        return {
          errors: { userId: "This login is already linked." },
          ok: false,
        };
      }
      return { errors: { root: "This record already exists." }, ok: false };
    }
    return {
      errors: { root: "Could not update this staff record. Try again." },
      ok: false,
    };
  }
};
