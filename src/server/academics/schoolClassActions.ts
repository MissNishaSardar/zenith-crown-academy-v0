"use server";

import { Prisma } from "@generated/prisma/client";

import prisma from "@/lib/dbClient/prisma";
import { schoolClassSchema, type schoolClassType } from "@/lib/zodSchema";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { requireActivePermission } from "@/server/guards";

export type SchoolClassResult =
  | {
      ok: true;
      schoolClass: { band: string; id: string; name: string; order: number };
    }
  | {
      errors: Partial<
        Record<"band" | "isActive" | "name" | "order" | "root", string>
      >;
      ok: false;
    };

const toSafeClass = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of ["band", "isActive", "name", "order"]) {
    out[field] = record[field] ?? null;
  }
  return out;
};

export const createSchoolClass = async (
  input: schoolClassType,
): Promise<SchoolClassResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = schoolClassSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<
      Record<"band" | "isActive" | "name" | "order" | "root", string>
    > = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "root") as keyof typeof fieldErrors;
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { errors: fieldErrors, ok: false };
  }
  const name = parsed.data.name.trim();
  try {
    const row = await prisma.schoolClass.create({
      data: {
        band: parsed.data.band,
        isActive: parsed.data.isActive,
        name,
        order: parsed.data.order,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeClass(row),
      before: null,
      entity: "school-class",
      entityId: row.id,
    });
    return {
      ok: true,
      schoolClass: {
        band: row.band,
        id: row.id,
        name: row.name,
        order: row.order,
      },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      if (target.includes("order")) {
        return { errors: { order: "This order is already used." }, ok: false };
      }
      return {
        errors: { name: "A class with this name already exists." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this class. Try again." },
      ok: false,
    };
  }
};

export const updateSchoolClass = async (
  input: schoolClassType & { id: string },
): Promise<SchoolClassResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  if (!input.id) {
    return { errors: { root: "Missing class id." }, ok: false };
  }
  const parsed = schoolClassSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<
      Record<"band" | "isActive" | "name" | "order" | "root", string>
    > = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "root") as keyof typeof fieldErrors;
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { errors: fieldErrors, ok: false };
  }
  const target = await prisma.schoolClass.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This class no longer exists." }, ok: false };
  }
  try {
    const before = toSafeClass(target);
    const row = await prisma.schoolClass.update({
      data: {
        band: parsed.data.band,
        isActive: parsed.data.isActive,
        name: parsed.data.name.trim(),
        order: parsed.data.order,
      },
      where: { id: input.id },
    });
    const minimal = toMinimalAuditChange(before, toSafeClass(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "school-class",
      entityId: row.id,
    });
    return {
      ok: true,
      schoolClass: {
        band: row.band,
        id: row.id,
        name: row.name,
        order: row.order,
      },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const targetError = String(error.meta?.target ?? "");
      if (targetError.includes("order")) {
        return { errors: { order: "This order is already used." }, ok: false };
      }
      return {
        errors: { name: "A class with this name already exists." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not update this class. Try again." },
      ok: false,
    };
  }
};
