"use server";

import { Prisma } from "@generated/prisma/client";

import prisma from "@/lib/dbClient/prisma";
import {
  sectionSchema,
  workingDaySchema,
  type sectionType,
} from "@/lib/zodSchema";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { requireActivePermission } from "@/server/guards";

export type SectionResult =
  | { ok: true; section: { id: string; name: string } }
  | {
      errors: Partial<
        Record<
          | "capacity"
          | "classId"
          | "classTeacherId"
          | "name"
          | "root"
          | "yearId",
          string
        >
      >;
      ok: false;
    };

const toSafeSection = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "capacity",
    "classId",
    "classTeacherId",
    "name",
    "yearId",
  ]) {
    out[field] = record[field] ?? null;
  }
  return out;
};

const toFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
) => {
  const fieldErrors: Partial<
    Record<
      "capacity" | "classId" | "classTeacherId" | "name" | "root" | "yearId",
      string
    >
  > = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof typeof fieldErrors;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

export const createSection = async (
  input: sectionType,
): Promise<SectionResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = sectionSchema.safeParse(input);
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
  const year = await prisma.academicYear.findUnique({
    where: { id: parsed.data.yearId },
  });
  if (!year) {
    return { errors: { yearId: "Pick a valid academic year." }, ok: false };
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: parsed.data.classId },
  });
  if (!schoolClass) {
    return { errors: { classId: "Pick a valid class." }, ok: false };
  }
  const teacher = await prisma.user.findUnique({
    where: { id: parsed.data.classTeacherId },
  });
  if (!teacher) {
    return {
      errors: { classTeacherId: "Pick a valid class teacher." },
      ok: false,
    };
  }
  try {
    const row = await prisma.section.create({
      data: {
        capacity: parsed.data.capacity,
        classId: parsed.data.classId,
        classTeacherId: parsed.data.classTeacherId,
        name: parsed.data.name.trim(),
        yearId: parsed.data.yearId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeSection(row),
      before: null,
      entity: "section",
      entityId: row.id,
    });
    return { ok: true, section: { id: row.id, name: row.name } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          name: "This section already exists for this year and class.",
        },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this section. Try again." },
      ok: false,
    };
  }
};

export const updateSection = async (
  input: sectionType & { id: string },
): Promise<SectionResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  if (!input.id) {
    return { errors: { root: "Missing section id." }, ok: false };
  }
  const parsed = sectionSchema.safeParse(input);
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
  const target = await prisma.section.findUnique({ where: { id: input.id } });
  if (!target) {
    return { errors: { root: "This section no longer exists." }, ok: false };
  }
  const teacher = await prisma.user.findUnique({
    where: { id: parsed.data.classTeacherId },
  });
  if (!teacher) {
    return {
      errors: { classTeacherId: "Pick a valid class teacher." },
      ok: false,
    };
  }
  try {
    const before = toSafeSection(target);
    const row = await prisma.section.update({
      data: {
        capacity: parsed.data.capacity,
        classTeacherId: parsed.data.classTeacherId,
        name: parsed.data.name.trim(),
      },
      where: { id: input.id },
    });
    const minimal = toMinimalAuditChange(before, toSafeSection(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "section",
      entityId: row.id,
    });
    return { ok: true, section: { id: row.id, name: row.name } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          name: "This section already exists for this year and class.",
        },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not update this section. Try again." },
      ok: false,
    };
  }
};

export type WorkingDayResult =
  | { ok: true; day: { id: string } }
  | {
      errors: Partial<
        Record<"date" | "note" | "root" | "type" | "yearId", string>
      >;
      ok: false;
    };

export const createWorkingDay = async (input: {
  date: string;
  note?: string;
  type: "HOLIDAY" | "EXAM_BREAK" | "WORKING_SATURDAY";
  yearId: string;
}): Promise<WorkingDayResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = workingDaySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<
      Record<"date" | "note" | "root" | "type" | "yearId", string>
    > = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "root") as keyof typeof fieldErrors;
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { errors: fieldErrors, ok: false };
  }
  const year = await prisma.academicYear.findUnique({
    where: { id: parsed.data.yearId },
  });
  if (!year) {
    return { errors: { yearId: "Pick a valid academic year." }, ok: false };
  }
  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) {
    return { errors: { date: "Pick a valid date." }, ok: false };
  }
  try {
    const row = await prisma.workingDay.create({
      data: {
        date,
        note: parsed.data.note?.trim() || null,
        type: parsed.data.type,
        yearId: parsed.data.yearId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: {
        date: row.date.toISOString(),
        type: row.type,
        yearId: row.yearId,
      },
      before: null,
      entity: "working-day",
      entityId: row.id,
    });
    return { ok: true, day: { id: row.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { date: "A calendar entry already exists for this date." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not add this day. Try again." },
      ok: false,
    };
  }
};

export const deleteWorkingDay = async (
  id: string,
): Promise<
  { ok: true } | { errors: Partial<Record<"root", string>>; ok: false }
> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const target = await prisma.workingDay.findUnique({ where: { id } });
  if (!target) {
    return { errors: { root: "This entry no longer exists." }, ok: false };
  }
  await prisma.workingDay.delete({ where: { id } });
  await logAudit({
    action: "delete",
    actor,
    after: null,
    before: {
      date: target.date.toISOString(),
      type: target.type,
      yearId: target.yearId,
    },
    entity: "working-day",
    entityId: id,
  });
  return { ok: true };
};
