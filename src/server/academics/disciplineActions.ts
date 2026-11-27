"use server";

import { can } from "@/lib/auth/permissions";
import { disciplineSchema, type disciplineType } from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { assertTeacherScope } from "@/server/academics/scopeHelpers";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const isValidCalendarDate = (value: string): boolean => {
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

const toSafeIncident = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "actionTaken",
    "category",
    "date",
    "description",
    "status",
    "studentId",
    "yearId",
  ]) {
    const value = record[field];
    out[field] =
      value instanceof Date ?
        value.toISOString().slice(0, 10)
      : (value ?? null);
  }
  return out;
};

const toFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root");
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
};

const requireDisciplineMarker = async (input: {
  classId: string;
  sectionId: string | null;
  yearId: string;
}) => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const manager =
    active !== null &&
    (can(active, "academic:manage-discipline") ||
      can(active, "academic:manage-curriculum"));
  if (manager && input.sectionId) {
    const staff = await prisma.staffProfile.findFirst({
      select: { wardStudentId: true },
      where: { userId: session.user.id },
    });
    if (staff?.wardStudentId) {
      const ward = await prisma.studentProfile.findFirst({
        select: { id: true },
        where: {
          classId: input.classId,
          id: staff.wardStudentId,
          sectionId: input.sectionId,
          yearId: input.yearId,
        },
      });
      if (ward) {
        await logAudit({
          action: "permission-deny",
          actor,
          after: {
            active: active ?? null,
            blocked: true,
            reason: "ward-conflict-whole-class",
          },
          before: null,
          entity: "permission",
          entityId: session.user.id,
        });
        throw new ForbiddenError("teacher-scope");
      }
    }
    return { actor, session };
  }
  if (input.sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: input.sectionId },
    });
    if (section && section.classTeacherId === session.user.id) {
      return { actor, session };
    }
    await assertTeacherScope({
      classId: input.classId,
      sectionId: input.sectionId,
      userId: session.user.id,
      yearId: input.yearId,
    });
    return { actor, session };
  }
  if (!manager) {
    throw new ForbiddenError("teacher-scope");
  }
  return { actor, session };
};

export type DisciplineResult =
  | { incident: { id: string }; ok: true }
  | { errors: Record<string, string>; ok: false };

export const createDisciplineIncident = async (
  input: disciplineType,
): Promise<DisciplineResult> => {
  const parsed = disciplineSchema.safeParse(input);
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
  if (!datePattern.test(data.date) || !isValidCalendarDate(data.date)) {
    return { errors: { date: "Pick a valid date." }, ok: false };
  }
  const student = await prisma.studentProfile.findUnique({
    where: { id: data.studentId },
  });
  if (!student) {
    return {
      errors: { studentId: "This student no longer exists." },
      ok: false,
    };
  }
  const year = await prisma.academicYear.findUnique({
    where: { id: data.yearId },
  });
  if (!year) {
    return { errors: { yearId: "Pick a valid academic year." }, ok: false };
  }
  if (year.status === "CLOSED") {
    return { errors: { yearId: "This academic year is closed." }, ok: false };
  }
  const { actor } = await requireDisciplineMarker({
    classId: student.classId,
    sectionId: student.sectionId,
    yearId: data.yearId,
  });
  const target = new Date(`${data.date}T00:00:00Z`);
  const row = await prisma.disciplineIncident.create({
    data: {
      actionTaken:
        (data.actionTaken ?? "").trim() === "" ?
          null
        : (data.actionTaken?.trim() ?? null),
      category: data.category,
      categoryNote:
        (data.categoryNote ?? "").trim() === "" ?
          null
        : (data.categoryNote?.trim() ?? null),
      date: target,
      description: data.description.trim(),
      reportedBy: actor.id,
      status: data.status,
      studentId: data.studentId,
      yearId: data.yearId,
    },
  });
  await logAudit({
    action: "create",
    actor,
    after: toSafeIncident(row),
    before: null,
    entity: "discipline-incident",
    entityId: row.id,
  });
  return { incident: { id: row.id }, ok: true };
};

export const updateDisciplineIncident = async (
  input: disciplineType & { id: string },
): Promise<DisciplineResult> => {
  if (!input.id) {
    return { errors: { root: "Missing incident id." }, ok: false };
  }
  const parsed = disciplineSchema.safeParse(input);
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
  const target = await prisma.disciplineIncident.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This incident no longer exists." }, ok: false };
  }
  const student = await prisma.studentProfile.findUnique({
    where: { id: parsed.data.studentId },
  });
  if (!student) {
    return {
      errors: { studentId: "This student no longer exists." },
      ok: false,
    };
  }
  const { actor } = await requireDisciplineMarker({
    classId: student.classId,
    sectionId: student.sectionId,
    yearId: parsed.data.yearId,
  });
  if (
    !datePattern.test(parsed.data.date) ||
    !isValidCalendarDate(parsed.data.date)
  ) {
    return { errors: { date: "Pick a valid date." }, ok: false };
  }
  const before = toSafeIncident(target);
  const row = await prisma.disciplineIncident.update({
    data: {
      actionTaken:
        (parsed.data.actionTaken ?? "").trim() === "" ?
          null
        : (parsed.data.actionTaken?.trim() ?? null),
      category: parsed.data.category,
      categoryNote:
        (parsed.data.categoryNote ?? "").trim() === "" ?
          null
        : (parsed.data.categoryNote?.trim() ?? null),
      date: new Date(`${parsed.data.date}T00:00:00Z`),
      description: parsed.data.description.trim(),
      status: parsed.data.status,
    },
    where: { id: target.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeIncident(row));
  await logAudit({
    action: "update",
    actor,
    after: minimal.after,
    before: minimal.before,
    entity: "discipline-incident",
    entityId: row.id,
  });
  return { incident: { id: row.id }, ok: true };
};
