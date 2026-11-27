"use server";

import { Prisma } from "@generated/prisma/client";

import { parseRoleNames } from "@/lib/auth/permissions";
import {
  teacherAssignmentSchema,
  type teacherAssignmentType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { requireActivePermission } from "@/server/guards";

export type TeacherAssignmentResult =
  | { ok: true; assignment: { id: string } }
  | {
      errors: Partial<
        Record<
          | "classId"
          | "isActive"
          | "root"
          | "sectionId"
          | "subjectId"
          | "teacherId"
          | "yearId",
          string
        >
      >;
      ok: false;
    };

type AssignmentErrorMap = Extract<
  TeacherAssignmentResult,
  { ok: false }
>["errors"];

const toSafeAssignment = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "classId",
    "isActive",
    "sectionId",
    "subjectId",
    "teacherId",
    "yearId",
  ]) {
    out[field] = record[field] ?? null;
  }
  return out;
};

const toFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): AssignmentErrorMap => {
  const fieldErrors: AssignmentErrorMap = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof AssignmentErrorMap;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

const validateAssignment = async (
  data: teacherAssignmentType,
  excludeId?: string,
): Promise<{ errors: AssignmentErrorMap; ok: false } | { ok: true }> => {
  const year = await prisma.academicYear.findUnique({
    where: { id: data.yearId },
  });
  if (!year) {
    return { errors: { yearId: "Pick a valid academic year." }, ok: false };
  }
  if (year.status === "CLOSED") {
    return { errors: { yearId: "This academic year is closed." }, ok: false };
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: data.classId },
  });
  if (!schoolClass || !schoolClass.isActive) {
    return { errors: { classId: "Pick a valid active class." }, ok: false };
  }
  const sectionId = data.sectionId?.trim() || null;
  if (sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });
    if (!section) {
      return { errors: { sectionId: "Pick a valid section." }, ok: false };
    }
    if (section.yearId !== data.yearId || section.classId !== data.classId) {
      return {
        errors: {
          sectionId: "This section does not belong to the class year.",
        },
        ok: false,
      };
    }
  }
  const classSubject = await prisma.classSubject.findUnique({
    where: {
      classId_subjectId: { classId: data.classId, subjectId: data.subjectId },
    },
  });
  if (!classSubject) {
    return {
      errors: { subjectId: "This subject is not taught in the class." },
      ok: false,
    };
  }
  const teacher = await prisma.user.findUnique({
    where: { id: data.teacherId },
  });
  if (!teacher) {
    return { errors: { teacherId: "Pick a valid teacher." }, ok: false };
  }
  const held = parseRoleNames(teacher.role);
  const teaches =
    held.includes("teacher") ||
    held.includes("principal") ||
    held.includes("vice_principal");
  if (!teaches) {
    return {
      errors: { teacherId: "This user does not hold a teaching role." },
      ok: false,
    };
  }
  const duplicate = await prisma.teacherAssignment.findFirst({
    select: { id: true },
    where: {
      classId: data.classId,
      sectionId,
      subjectId: data.subjectId,
      teacherId: data.teacherId,
      yearId: data.yearId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (duplicate) {
    return {
      errors: { root: "This teacher already holds this assignment." },
      ok: false,
    };
  }
  return { ok: true };
};

export const createTeacherAssignment = async (
  input: teacherAssignmentType,
): Promise<TeacherAssignmentResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = teacherAssignmentSchema.safeParse(input);
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
  const data = {
    ...parsed.data,
    sectionId: parsed.data.sectionId?.trim() || null,
  };
  const check = await validateAssignment(data);
  if (!check.ok) {
    return { errors: check.errors, ok: false };
  }
  try {
    const row = await prisma.teacherAssignment.create({
      data: {
        classId: data.classId,
        isActive: data.isActive,
        sectionId: data.sectionId,
        subjectId: data.subjectId,
        teacherId: data.teacherId,
        yearId: data.yearId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeAssignment(row),
      before: null,
      entity: "teacher-assignment",
      entityId: row.id,
    });
    return { assignment: { id: row.id }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { root: "This teacher already holds this assignment." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this assignment. Try again." },
      ok: false,
    };
  }
};

export const updateTeacherAssignment = async (
  input: teacherAssignmentType & { id: string },
): Promise<TeacherAssignmentResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  if (!input.id) {
    return { errors: { root: "Missing assignment id." }, ok: false };
  }
  const parsed = teacherAssignmentSchema.safeParse(input);
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
  const target = await prisma.teacherAssignment.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This assignment no longer exists." }, ok: false };
  }
  const data = {
    ...parsed.data,
    sectionId: parsed.data.sectionId?.trim() || null,
  };
  const check = await validateAssignment(data, target.id);
  if (!check.ok) {
    return { errors: check.errors, ok: false };
  }
  try {
    const before = toSafeAssignment(target);
    const row = await prisma.teacherAssignment.update({
      data: {
        isActive: data.isActive,
        sectionId: data.sectionId,
        subjectId: data.subjectId,
        teacherId: data.teacherId,
      },
      where: { id: target.id },
    });
    const minimal = toMinimalAuditChange(before, toSafeAssignment(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "teacher-assignment",
      entityId: row.id,
    });
    return { assignment: { id: row.id }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { root: "This teacher already holds this assignment." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not update this assignment. Try again." },
      ok: false,
    };
  }
};
