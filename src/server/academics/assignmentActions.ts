"use server";

import { Prisma } from "@generated/prisma/client";

import { can } from "@/lib/auth/permissions";
import {
  assignmentGradeSchema,
  assignmentSchema,
  assignmentSubmitSchema,
  type assignmentGradeType,
  type assignmentSubmitType,
  type assignmentType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { deleteStoredFile, saveFile } from "@/lib/storage/storage";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { assertTeacherScope } from "@/server/academics/scopeHelpers";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

const ACTIVE_ENROLLMENT = ["ENROLLED", "PROMOTED", "REPEATED"] as const;

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

const toMidnightUTC = (value: string): Date => new Date(`${value}T00:00:00Z`);

const toSafeAssignment = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "classId",
    "dueDate",
    "instructions",
    "sectionId",
    "status",
    "subjectId",
    "title",
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

const toSafeSubmission = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "assignmentId",
    "feedback",
    "gradeLabel",
    "status",
    "studentId",
    "text",
  ]) {
    out[field] = record[field] ?? null;
  }
  out.hasFile = Boolean(record["filePath"]);
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

const requireAssignmentWriter = async (input: {
  classId: string;
  sectionId: string | null;
  subjectId: string;
  yearId: string;
}) => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const staffWard = await prisma.staffProfile.findFirst({
    select: { wardStudentId: true },
    where: { userId: session.user.id },
  });
  if (staffWard?.wardStudentId) {
    const wardEnrollment = await prisma.enrollment.findFirst({
      select: { id: true },
      where: {
        classId: input.classId,
        ...(input.sectionId ? { sectionId: input.sectionId } : {}),
        status: { in: [...ACTIVE_ENROLLMENT] },
        studentId: staffWard.wardStudentId,
        yearId: input.yearId,
      },
    });
    const wardProfile =
      wardEnrollment ? null : (
        await prisma.studentProfile.findFirst({
          select: { id: true },
          where: {
            classId: input.classId,
            id: staffWard.wardStudentId,
            ...(input.sectionId ? { sectionId: input.sectionId } : {}),
            yearId: input.yearId,
          },
        })
      );
    if (wardEnrollment ?? wardProfile) {
      await logAudit({
        action: "permission-deny",
        actor,
        after: {
          active: active ?? null,
          blocked: true,
          classId: input.classId,
          reason: "ward-conflict-whole-class",
          sectionId: input.sectionId,
        },
        before: null,
        entity: "assignment",
        entityId: null,
      });
      throw new ForbiddenError("teacher-scope");
    }
  }
  if (
    active &&
    (can(active, "academic:manage-assignments") ||
      can(active, "academic:manage-curriculum"))
  ) {
    return { actor, session };
  }
  if (!input.sectionId) {
    const wholeCover = await prisma.teacherAssignment.findFirst({
      select: { id: true },
      where: {
        classId: input.classId,
        isActive: true,
        sectionId: null,
        subjectId: input.subjectId,
        teacherId: session.user.id,
        yearId: input.yearId,
      },
    });
    if (wholeCover) {
      return { actor, session };
    }
    await logAudit({
      action: "permission-deny",
      actor,
      after: {
        active: active ?? null,
        blocked: true,
        classId: input.classId,
        reason: "teacher-assignment-denied",
        subjectId: input.subjectId,
        yearId: input.yearId,
      },
      before: null,
      entity: "assignment",
      entityId: null,
    });
    throw new ForbiddenError("teacher-scope");
  }
  await assertTeacherScope({
    classId: input.classId,
    sectionId: input.sectionId,
    subjectId: input.subjectId,
    userId: session.user.id,
    yearId: input.yearId,
  });
  return { actor, session };
};

const validatePlacement = async (
  data: assignmentType,
): Promise<
  | { ok: true; dueDate: Date | null; sectionId: string | null }
  | { errors: Record<string, string>; ok: false }
> => {
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
  const sectionId = (data.sectionId ?? "").trim() || null;
  if (sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });
    if (
      !section ||
      section.yearId !== data.yearId ||
      section.classId !== data.classId
    ) {
      return {
        errors: {
          sectionId: "This section does not belong to the class year.",
        },
        ok: false,
      };
    }
  }
  const subject = await prisma.subject.findUnique({
    where: { id: data.subjectId },
  });
  if (!subject) {
    return { errors: { subjectId: "Pick a valid subject." }, ok: false };
  }
  const link = await prisma.classSubject.findUnique({
    where: {
      classId_subjectId: { classId: data.classId, subjectId: data.subjectId },
    },
  });
  if (!link) {
    return {
      errors: { subjectId: "This subject is not taught in the class." },
      ok: false,
    };
  }
  const rawDue = (data.dueDate ?? "").trim();
  if (
    (data.status === "PUBLISHED" || data.status === "CLOSED") &&
    rawDue === ""
  ) {
    return {
      errors: { dueDate: "Due date is required to publish." },
      ok: false,
    };
  }
  if (
    rawDue !== "" &&
    (!datePattern.test(rawDue) || !isValidCalendarDate(rawDue))
  ) {
    return { errors: { dueDate: "Pick a valid due date." }, ok: false };
  }
  return {
    dueDate: rawDue === "" ? null : toMidnightUTC(rawDue),
    ok: true,
    sectionId,
  };
};

export type AssignmentResult =
  | { assignment: { id: string }; ok: true }
  | { errors: Record<string, string>; ok: false };

export const createAssignment = async (
  input: assignmentType,
): Promise<AssignmentResult> => {
  const parsed = assignmentSchema.safeParse(input);
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
  const placement = await validatePlacement(data);
  if (!placement.ok) return placement;
  const { actor } = await requireAssignmentWriter({
    classId: data.classId,
    sectionId: placement.sectionId,
    subjectId: data.subjectId,
    yearId: data.yearId,
  });
  try {
    const row = await prisma.assignment.create({
      data: {
        classId: data.classId,
        createdBy: actor.id,
        dueDate: placement.dueDate,
        instructions: (data.instructions ?? "").trim() || null,
        sectionId: placement.sectionId,
        status: data.status,
        subjectId: data.subjectId,
        title: data.title.trim(),
        yearId: data.yearId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeAssignment(row),
      before: null,
      entity: "assignment",
      entityId: row.id,
    });
    return { assignment: { id: row.id }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { errors: { root: "This assignment already exists." }, ok: false };
    }
    return {
      errors: { root: "Could not create this assignment. Try again." },
      ok: false,
    };
  }
};

export const updateAssignment = async (
  input: assignmentType & { id: string },
): Promise<AssignmentResult> => {
  if (!input.id) {
    return { errors: { root: "Missing assignment id." }, ok: false };
  }
  const parsed = assignmentSchema.safeParse(input);
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
  const target = await prisma.assignment.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This assignment no longer exists." }, ok: false };
  }
  const data = parsed.data;
  const placement = await validatePlacement(data);
  if (!placement.ok) return placement;
  const { actor } = await requireAssignmentWriter({
    classId: target.classId,
    sectionId: target.sectionId,
    subjectId: target.subjectId,
    yearId: target.yearId,
  });
  const nextWriter =
    (
      target.classId !== data.classId ||
      (target.sectionId ?? null) !== placement.sectionId ||
      target.subjectId !== data.subjectId ||
      target.yearId !== data.yearId
    ) ?
      await requireAssignmentWriter({
        classId: data.classId,
        sectionId: placement.sectionId,
        subjectId: data.subjectId,
        yearId: data.yearId,
      }).then(() => actor)
    : actor;
  if (target.status === "CLOSED") {
    return {
      errors: { root: "Closed assignments stay read only." },
      ok: false,
    };
  }
  const before = toSafeAssignment(target);
  const row = await prisma.assignment.update({
    data: {
      classId: data.classId,
      dueDate: placement.dueDate,
      instructions: (data.instructions ?? "").trim() || null,
      sectionId: placement.sectionId,
      status: data.status,
      subjectId: data.subjectId,
      title: data.title.trim(),
      yearId: data.yearId,
    },
    where: { id: target.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeAssignment(row));
  await logAudit({
    action: "update",
    actor: nextWriter,
    after: minimal.after,
    before: minimal.before,
    entity: "assignment",
    entityId: row.id,
  });
  return { assignment: { id: row.id }, ok: true };
};

const resolveSubmitter = async (input: {
  assignment: {
    classId: string;
    sectionId: string | null;
    subjectId: string;
    yearId: string;
  };
  studentId: string;
}): Promise<
  | { ok: true; studentId: string }
  | { errors: Record<string, string>; ok: false }
> => {
  const session = await requireSession();
  const student = await prisma.studentProfile.findUnique({
    where: { id: input.studentId },
  });
  if (!student) {
    return { errors: { root: "This student no longer exists." }, ok: false };
  }
  const isOwn = student.userId === session.user.id;
  if (!isOwn) {
    const guardian = await prisma.guardian.findFirst({
      where: { userId: session.user.id },
    });
    if (!guardian) {
      return {
        errors: { root: "Only the student or a linked guardian can submit." },
        ok: false,
      };
    }
    const link = await prisma.studentGuardianLink.findUnique({
      where: {
        studentId_guardianId: {
          guardianId: guardian.id,
          studentId: student.id,
        },
      },
    });
    if (!link) {
      return {
        errors: { root: "Only a linked guardian can submit." },
        ok: false,
      };
    }
  }
  const enrollment = await prisma.enrollment.findFirst({
    select: { id: true, sectionId: true },
    where: {
      classId: input.assignment.classId,
      ...(input.assignment.sectionId ?
        { sectionId: input.assignment.sectionId }
      : {}),
      status: { in: [...ACTIVE_ENROLLMENT] },
      studentId: student.id,
      yearId: input.assignment.yearId,
    },
  });
  if (!enrollment) {
    return {
      errors: { root: "You are not enrolled for this assignment." },
      ok: false,
    };
  }
  const classLink = await prisma.classSubject.findUnique({
    select: { isOptional: true },
    where: {
      classId_subjectId: {
        classId: input.assignment.classId,
        subjectId: input.assignment.subjectId,
      },
    },
  });
  if (!classLink) {
    return {
      errors: { root: "This subject is not taught in the class." },
      ok: false,
    };
  }
  if (classLink.isOptional) {
    const pick = await prisma.enrollmentSubjectPick.findUnique({
      select: { id: true },
      where: {
        enrollmentId_subjectId: {
          enrollmentId: enrollment.id,
          subjectId: input.assignment.subjectId,
        },
      },
    });
    if (!pick) {
      return {
        errors: { root: "You are not enrolled for this assignment." },
        ok: false,
      };
    }
  }
  return { ok: true, studentId: student.id };
};

export type SubmissionResult =
  | { ok: true; submission: { id: string } }
  | { errors: Record<string, string>; ok: false };

export const submitAssignmentWork = async (
  formData: FormData,
): Promise<SubmissionResult> => {
  const rawInput = {
    assignmentId: String(formData.get("assignmentId") ?? ""),
    filePath: null,
    text: formData.get("text") ? String(formData.get("text")) : null,
  };
  const studentRaw = String(formData.get("studentId") ?? "").trim();
  const parsed = assignmentSubmitSchema.safeParse(rawInput);
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
  if (!studentRaw) {
    return { errors: { studentId: "Pick a student." }, ok: false };
  }
  const assignment = await prisma.assignment.findUnique({
    where: { id: parsed.data.assignmentId },
  });
  if (!assignment) {
    return { errors: { root: "This assignment no longer exists." }, ok: false };
  }
  if (assignment.status !== "PUBLISHED") {
    return {
      errors: { root: "This assignment is not open for submission." },
      ok: false,
    };
  }
  const year = await prisma.academicYear.findUnique({
    where: { id: assignment.yearId },
  });
  if (!year || year.status === "CLOSED") {
    return { errors: { root: "This academic year is closed." }, ok: false };
  }
  const resolved = await resolveSubmitter({
    assignment: {
      classId: assignment.classId,
      sectionId: assignment.sectionId,
      subjectId: assignment.subjectId,
      yearId: assignment.yearId,
    },
    studentId: studentRaw,
  });
  if (!resolved.ok) return resolved;
  const text = (parsed.data.text ?? "").trim();
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!text && !hasFile) {
    return { errors: { root: "Add text or attach a file." }, ok: false };
  }
  if (text.length > 2000) {
    return { errors: { text: "Submission text is too long." }, ok: false };
  }
  const existing = await prisma.assignmentSubmission.findUnique({
    where: {
      assignmentId_studentId: {
        assignmentId: assignment.id,
        studentId: resolved.studentId,
      },
    },
  });
  let filePath: string | null = existing?.filePath ?? null;
  if (hasFile && file instanceof File) {
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const saved = await saveFile({
        bytes,
        filename: file.name || "submission",
        folder: `assignments/${assignment.id}`,
      });
      if (filePath && filePath !== saved) {
        await deleteStoredFile(filePath).catch(() => undefined);
      }
      filePath = saved;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save this file.";
      if (message.includes("too large") || message.includes("5 MB")) {
        return {
          errors: { file: "File is too large. Limit is 5 MB." },
          ok: false,
        };
      }
      if (message.includes("not allowed") || message.includes("File type")) {
        return {
          errors: { file: "Use PDF, image, or document files only." },
          ok: false,
        };
      }
      return { errors: { file: "Could not save this file." }, ok: false };
    }
  }
  const session = await requireSession();
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  if (existing) {
    const before = toSafeSubmission(existing);
    const row = await prisma.assignmentSubmission.update({
      data: {
        filePath,
        status: "SUBMITTED",
        text: text || null,
      },
      where: { id: existing.id },
    });
    const minimal = toMinimalAuditChange(before, toSafeSubmission(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "assignment-submission",
      entityId: row.id,
    });
    return { ok: true, submission: { id: row.id } };
  }
  const row = await prisma.assignmentSubmission.create({
    data: {
      assignmentId: assignment.id,
      filePath,
      status: "SUBMITTED",
      studentId: resolved.studentId,
      text: text || null,
    },
  });
  await logAudit({
    action: "create",
    actor,
    after: toSafeSubmission(row),
    before: null,
    entity: "assignment-submission",
    entityId: row.id,
  });
  return { ok: true, submission: { id: row.id } };
};

export const gradeAssignmentSubmission = async (
  input: assignmentGradeType,
): Promise<SubmissionResult> => {
  const parsed = assignmentGradeSchema.safeParse(input);
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
  const target = await prisma.assignmentSubmission.findUnique({
    include: { assignment: true },
    where: { id: parsed.data.submissionId },
  });
  if (!target) {
    return { errors: { root: "This submission no longer exists." }, ok: false };
  }
  const gradeYear = await prisma.academicYear.findUnique({
    select: { status: true },
    where: { id: target.assignment.yearId },
  });
  if (!gradeYear || gradeYear.status === "CLOSED") {
    return { errors: { root: "This academic year is closed." }, ok: false };
  }
  const { actor } = await requireAssignmentWriter({
    classId: target.assignment.classId,
    sectionId: target.assignment.sectionId,
    subjectId: target.assignment.subjectId,
    yearId: target.assignment.yearId,
  });
  const gradeLabel = (parsed.data.gradeLabel ?? "").trim() || null;
  const feedback = (parsed.data.feedback ?? "").trim() || null;
  const before = toSafeSubmission(target);
  const row = await prisma.assignmentSubmission.update({
    data: { feedback, gradeLabel, status: "GRADED" },
    where: { id: target.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeSubmission(row));
  await logAudit({
    action: "update",
    actor,
    after: minimal.after,
    before: minimal.before,
    entity: "assignment-submission",
    entityId: row.id,
  });
  return { ok: true, submission: { id: row.id } };
};

export type AssignmentSubmitInput = assignmentSubmitType & {
  studentId: string;
};
