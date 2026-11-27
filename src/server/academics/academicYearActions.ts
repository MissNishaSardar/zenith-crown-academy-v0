"use server";

import { Prisma } from "@generated/prisma/client";

import prisma from "@/lib/dbClient/prisma";
import { academicYearSchema, type academicYearType } from "@/lib/zodSchema";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { requireActivePermission } from "@/server/guards";

export type AcademicYearResult =
  | { ok: true; year: { id: string; name: string; status: string } }
  | {
      errors: Partial<
        Record<"endDate" | "name" | "root" | "startDate" | "status", string>
      >;
      ok: false;
    };

type YearErrorMap = Partial<
  Record<"endDate" | "name" | "root" | "startDate" | "status", string>
>;

const toSafeYear = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of ["endDate", "name", "startDate", "status"]) {
    const value = record[field];
    out[field] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
};

const toFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): YearErrorMap => {
  const fieldErrors: YearErrorMap = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof YearErrorMap;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

export const createAcademicYear = async (
  input: academicYearType,
): Promise<AcademicYearResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = academicYearSchema.safeParse(input);
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
  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { errors: { startDate: "Pick valid dates." }, ok: false };
  }
  if (end <= start) {
    return {
      errors: { endDate: "End date must be after start date." },
      ok: false,
    };
  }
  const existing = await prisma.academicYear.findUnique({
    where: { name: parsed.data.name.trim() },
  });
  if (existing) {
    return {
      errors: { name: "A year with this name already exists." },
      ok: false,
    };
  }
  try {
    const row = await prisma.$transaction(async (tx) => {
      if (parsed.data.status === "CURRENT") {
        const current = await tx.academicYear.findMany({
          where: { status: "CURRENT" },
        });
        if (current.length > 0) {
          throw new Error("ONLY_ONE_CURRENT");
        }
      }
      return tx.academicYear.create({
        data: {
          currentGuard: parsed.data.status === "CURRENT" ? "CURRENT" : null,
          endDate: end,
          name: parsed.data.name.trim(),
          startDate: start,
          status: parsed.data.status,
        },
      });
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeYear(row),
      before: null,
      entity: "academic-year",
      entityId: row.id,
    });
    return {
      ok: true,
      year: { id: row.id, name: row.name, status: row.status },
    };
  } catch (error) {
    if (error instanceof Error && error.message === "ONLY_ONE_CURRENT") {
      return {
        errors: { status: "Only one CURRENT year is allowed." },
        ok: false,
      };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      if (target.includes("currentGuard")) {
        return {
          errors: { status: "Only one CURRENT year is allowed." },
          ok: false,
        };
      }
      return {
        errors: { name: "A year with this name already exists." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this year. Try again." },
      ok: false,
    };
  }
};

export const updateAcademicYear = async (
  input: academicYearType & { id: string },
): Promise<AcademicYearResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  if (!input.id) {
    return { errors: { root: "Missing year id." }, ok: false };
  }
  const parsed = academicYearSchema.safeParse(input);
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
  const target = await prisma.academicYear.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This year no longer exists." }, ok: false };
  }
  if (target.status === "CLOSED" && parsed.data.status !== "CLOSED") {
    await logAudit({
      action: "update",
      actor,
      after: { blocked: true, reason: "closed-reopen-blocked" },
      before: toSafeYear(target),
      entity: "academic-year",
      entityId: target.id,
    });
    return {
      errors: { status: "Closed years cannot be reopened." },
      ok: false,
    };
  }
  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return {
      errors: { endDate: "End date must be after start date." },
      ok: false,
    };
  }
  const duplicate = await prisma.academicYear.findFirst({
    where: { id: { not: input.id }, name: parsed.data.name.trim() },
  });
  if (duplicate) {
    return {
      errors: { name: "A year with this name already exists." },
      ok: false,
    };
  }
  try {
    const before = toSafeYear(target);
    const row = await prisma.$transaction(async (tx) => {
      if (parsed.data.status === "CURRENT") {
        const current = await tx.academicYear.findMany({
          where: { status: "CURRENT" },
        });
        if (current.some((year) => year.id !== input.id)) {
          throw new Error("ONLY_ONE_CURRENT");
        }
      }
      return tx.academicYear.update({
        data: {
          currentGuard: parsed.data.status === "CURRENT" ? "CURRENT" : null,
          endDate: end,
          name: parsed.data.name.trim(),
          startDate: start,
          status: parsed.data.status,
        },
        where: { id: input.id },
      });
    });
    const minimal = toMinimalAuditChange(before, toSafeYear(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "academic-year",
      entityId: row.id,
    });
    return {
      ok: true,
      year: { id: row.id, name: row.name, status: row.status },
    };
  } catch (error) {
    if (error instanceof Error && error.message === "ONLY_ONE_CURRENT") {
      return {
        errors: { status: "Only one CURRENT year is allowed." },
        ok: false,
      };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      if (target.includes("currentGuard")) {
        return {
          errors: { status: "Only one CURRENT year is allowed." },
          ok: false,
        };
      }
      return {
        errors: { name: "A year with this name already exists." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not update this year. Try again." },
      ok: false,
    };
  }
};
