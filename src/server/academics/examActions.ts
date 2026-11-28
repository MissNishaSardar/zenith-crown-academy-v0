"use server";

import { Prisma } from "@generated/prisma/client";

import { can } from "@/lib/auth/permissions";
import {
  examPaperSchema,
  examSchema,
  examTransitionSchema,
  EXAM_STATUS_ORDER,
  paperComponentsSchema,
  toMarksHundredths,
  type examPaperType,
  type examTransitionType,
  type examType,
  type paperComponentsType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
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

const toMidnightUTC = (value: string): Date => new Date(`${value}T00:00:00Z`);

const toTodayKeyUTC = (): string => new Date().toISOString().slice(0, 10);

const toSafeExam = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "classId",
    "endDate",
    "name",
    "startDate",
    "status",
    "streamId",
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

const toSafePaper = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "classId",
    "date",
    "durationMin",
    "examId",
    "maxHundredths",
    "passHundredths",
    "subjectId",
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

const requireExamManager = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (active && can(active, "academic:manage-exams")) {
    return {
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      session,
    };
  }
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
      permission: "academic:manage-exams",
      reason: "exam-write-denied",
    },
    before: null,
    entity: "exam",
    entityId: null,
  });
  throw new ForbiddenError("academic:manage-exams");
};

const requireExamFinalizer = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (active && can(active, "academic:finalize-exams")) {
    return {
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      session,
    };
  }
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
      permission: "academic:finalize-exams",
      reason: "exam-finalize-denied",
    },
    before: null,
    entity: "exam",
    entityId: null,
  });
  throw new ForbiddenError("academic:finalize-exams");
};

const normalizeOptionalId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const validateExamScope = async (
  data: examType,
  excludeExamId?: string,
  isCreate = true,
): Promise<
  | { classOrder: number | null; ok: true; streamId: string | null }
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
  const classId = normalizeOptionalId(data.classId);
  const streamId = normalizeOptionalId(data.streamId);
  let classOrder: number | null = null;
  if (classId) {
    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: classId },
    });
    if (!schoolClass || !schoolClass.isActive) {
      return { errors: { classId: "Pick a valid active class." }, ok: false };
    }
    classOrder = schoolClass.order;
  }
  if (streamId) {
    if (!classId) {
      return {
        errors: { streamId: "Pick a class before picking a stream." },
        ok: false,
      };
    }
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });
    if (!stream || stream.classId !== classId) {
      return { errors: { streamId: "Pick a valid stream." }, ok: false };
    }
    if ((classOrder ?? 0) < 14) {
      return {
        errors: { streamId: "Streams exist only for Class 11 and 12." },
        ok: false,
      };
    }
  }
  if (
    !datePattern.test(data.startDate) ||
    !isValidCalendarDate(data.startDate) ||
    !datePattern.test(data.endDate) ||
    !isValidCalendarDate(data.endDate)
  ) {
    return { errors: { startDate: "Enter valid dates." }, ok: false };
  }
  if (isCreate) {
    const todayKey = toTodayKeyUTC();
    if (data.startDate < todayKey) {
      return {
        errors: { startDate: "Pick today or a future start date." },
        ok: false,
      };
    }
    if (data.endDate < todayKey) {
      return {
        errors: { endDate: "Pick today or a future end date." },
        ok: false,
      };
    }
  }
  const start = toMidnightUTC(data.startDate);
  const end = toMidnightUTC(data.endDate);
  const yearStart = new Date(year.startDate);
  yearStart.setUTCHours(0, 0, 0, 0);
  const yearEnd = new Date(year.endDate);
  yearEnd.setUTCHours(0, 0, 0, 0);
  if (start < yearStart || end > yearEnd) {
    return {
      errors: { startDate: "Exam dates must sit inside the academic year." },
      ok: false,
    };
  }
  const clash = await prisma.exam.findFirst({
    select: { id: true },
    where: {
      classId,
      name: data.name as never,
      streamId,
      yearId: data.yearId,
      ...(excludeExamId ? { id: { not: excludeExamId } } : {}),
    },
  });
  if (clash) {
    return {
      errors: {
        root: "This exam already exists for this year plus class plus stream.",
      },
      ok: false,
    };
  }
  return { classOrder, ok: true, streamId };
};

export type ExamResult =
  | { exam: { id: string }; ok: true }
  | { errors: Record<string, string>; ok: false };

export const createExam = async (input: examType): Promise<ExamResult> => {
  const parsed = examSchema.safeParse(input);
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
  const scope = await validateExamScope(data);
  if (!scope.ok) return scope;
  const { actor } = await requireExamManager();
  try {
    const row = await prisma.exam.create({
      data: {
        classId: normalizeOptionalId(data.classId),
        endDate: toMidnightUTC(data.endDate),
        name: data.name as never,
        startDate: toMidnightUTC(data.startDate),
        status: "DRAFT",
        streamId: scope.streamId,
        yearId: data.yearId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeExam(row),
      before: null,
      entity: "exam",
      entityId: row.id,
    });
    return { exam: { id: row.id }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { root: "This exam already exists for this scope." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this exam. Try again." },
      ok: false,
    };
  }
};

export const updateExam = async (
  input: examType & { id: string },
): Promise<ExamResult> => {
  if (!input.id) {
    return { errors: { root: "Missing exam id." }, ok: false };
  }
  const parsed = examSchema.safeParse(input);
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
  const target = await prisma.exam.findUnique({ where: { id: input.id } });
  if (!target) {
    return { errors: { root: "This exam no longer exists." }, ok: false };
  }
  if (target.status === "LOCKED" || target.status === "FINALIZED") {
    return {
      errors: { root: "Locked or finalized exams cannot be edited." },
      ok: false,
    };
  }
  const data = parsed.data;
  const scope = await validateExamScope(data, target.id, false);
  if (!scope.ok) return scope;
  const { actor } = await requireExamManager();
  const before = toSafeExam(target);
  const row = await prisma.exam.update({
    data: {
      classId: normalizeOptionalId(data.classId),
      endDate: toMidnightUTC(data.endDate),
      name: data.name as never,
      startDate: toMidnightUTC(data.startDate),
      streamId: scope.streamId,
      yearId: data.yearId,
    },
    where: { id: target.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeExam(row));
  await logAudit({
    action: "update",
    actor,
    after: minimal.after,
    before: minimal.before,
    entity: "exam",
    entityId: row.id,
  });
  return { exam: { id: row.id }, ok: true };
};

export type ExamTransitionResult =
  { ok: true; status: string } | { errors: Record<string, string>; ok: false };

export const transitionExamStatus = async (
  input: examTransitionType,
): Promise<ExamTransitionResult> => {
  const parsed = examTransitionSchema.safeParse(input);
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
  const target = await prisma.exam.findUnique({
    include: { papers: { include: { components: true } } },
    where: { id: parsed.data.examId },
  });
  if (!target) {
    return { errors: { root: "This exam no longer exists." }, ok: false };
  }
  const currentOrder = EXAM_STATUS_ORDER[target.status] ?? -1;
  const nextOrder = EXAM_STATUS_ORDER[parsed.data.target] ?? -1;
  if (nextOrder !== currentOrder + 1) {
    await logAudit({
      action: "permission-deny",
      actor: { id: null },
      after: {
        blocked: true,
        current: target.status,
        reason: "exam-transition-order",
        target: parsed.data.target,
      },
      before: null,
      entity: "exam",
      entityId: target.id,
    });
    return {
      errors: {
        root: `Move from ${target.status} to the next step only.`,
      },
      ok: false,
    };
  }
  const needsFinalizer =
    parsed.data.target === "LOCKED" || parsed.data.target === "FINALIZED";
  const { actor } =
    needsFinalizer ? await requireExamFinalizer() : await requireExamManager();
  if (parsed.data.target === "LOCKED" && target.papers.length === 0) {
    return {
      errors: { root: "Add at least one paper before locking." },
      ok: false,
    };
  }
  if (
    (parsed.data.target === "LOCKED" || parsed.data.target === "FINALIZED") &&
    target.papers.some((paper) => paper.components.length > 0)
  ) {
    for (const paper of target.papers) {
      if (paper.components.length === 0) continue;
      const maxSum = paper.components.reduce(
        (sum, row) => sum + row.maxHundredths,
        0,
      );
      const passSum = paper.components.reduce(
        (sum, row) => sum + row.passHundredths,
        0,
      );
      if (maxSum !== paper.maxHundredths || passSum !== paper.passHundredths) {
        return {
          errors: {
            root: "Component totals must match the paper max plus pass before this step.",
          },
          ok: false,
        };
      }
    }
  }
  const before = toSafeExam(target);
  const row = await prisma.exam.update({
    data: { status: parsed.data.target as never },
    where: { id: target.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeExam(row));
  await logAudit({
    action: "status",
    actor,
    after: minimal.after,
    before: minimal.before,
    entity: "exam",
    entityId: row.id,
  });
  return { ok: true, status: row.status };
};

const validatePaperScope = async (
  data: examPaperType,
  excludePaperId?: string,
  isCreate = true,
): Promise<
  { examId: string; ok: true } | { errors: Record<string, string>; ok: false }
> => {
  const exam = await prisma.exam.findUnique({
    include: { year: true },
    where: { id: data.examId },
  });
  if (!exam) {
    return { errors: { examId: "This exam no longer exists." }, ok: false };
  }
  if (exam.year.status === "CLOSED") {
    return { errors: { examId: "This academic year is closed." }, ok: false };
  }
  if (exam.status === "LOCKED" || exam.status === "FINALIZED") {
    return {
      errors: { root: "Locked or finalized exams cannot change papers." },
      ok: false,
    };
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: data.classId },
  });
  if (!schoolClass || !schoolClass.isActive) {
    return { errors: { classId: "Pick a valid active class." }, ok: false };
  }
  if (exam.classId && exam.classId !== data.classId) {
    return {
      errors: { classId: "This paper must match the exam class." },
      ok: false,
    };
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
  if (exam.streamId) {
    const mapping = await prisma.streamSubject.findUnique({
      where: {
        streamId_subjectId: {
          streamId: exam.streamId,
          subjectId: data.subjectId,
        },
      },
    });
    if (!mapping) {
      return {
        errors: { subjectId: "This subject is not mapped to the exam stream." },
        ok: false,
      };
    }
  }
  if (!datePattern.test(data.date) || !isValidCalendarDate(data.date)) {
    return { errors: { date: "Enter a valid date." }, ok: false };
  }
  if (isCreate && data.date < toTodayKeyUTC()) {
    return { errors: { date: "Pick today or a future date." }, ok: false };
  }
  const paperDate = toMidnightUTC(data.date);
  const start = new Date(exam.startDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(exam.endDate);
  end.setUTCHours(0, 0, 0, 0);
  if (paperDate < start || paperDate > end) {
    return {
      errors: { date: "Paper date must sit inside the exam dates." },
      ok: false,
    };
  }
  const clash = await prisma.examPaper.findFirst({
    select: { id: true },
    where: {
      classId: data.classId,
      examId: data.examId,
      subjectId: data.subjectId,
      ...(excludePaperId ? { id: { not: excludePaperId } } : {}),
    },
  });
  if (clash) {
    return {
      errors: {
        root: "This subject already has a paper in this exam plus class.",
      },
      ok: false,
    };
  }
  return { examId: exam.id, ok: true };
};

export type PaperResult =
  | { ok: true; paper: { id: string } }
  | { errors: Record<string, string>; ok: false };

export const createExamPaper = async (
  input: examPaperType,
): Promise<PaperResult> => {
  const parsed = examPaperSchema.safeParse(input);
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
  const scope = await validatePaperScope(data);
  if (!scope.ok) return scope;
  const { actor } = await requireExamManager();
  try {
    const row = await prisma.examPaper.create({
      data: {
        classId: data.classId,
        date: toMidnightUTC(data.date),
        durationMin: data.durationMin,
        examId: data.examId,
        maxHundredths: toMarksHundredths(data.maxMarks),
        passHundredths: toMarksHundredths(data.passMarks),
        subjectId: data.subjectId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafePaper(row),
      before: null,
      entity: "exam-paper",
      entityId: row.id,
    });
    return { ok: true, paper: { id: row.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          root: "This subject already has a paper in this exam plus class.",
        },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this paper. Try again." },
      ok: false,
    };
  }
};

export const updateExamPaper = async (
  input: examPaperType & { id: string },
): Promise<PaperResult> => {
  if (!input.id) {
    return { errors: { root: "Missing paper id." }, ok: false };
  }
  const parsed = examPaperSchema.safeParse(input);
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
  const target = await prisma.examPaper.findUnique({
    include: { exam: true },
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This paper no longer exists." }, ok: false };
  }
  if (target.exam.status === "LOCKED" || target.exam.status === "FINALIZED") {
    return {
      errors: { root: "Locked or finalized exams cannot change papers." },
      ok: false,
    };
  }
  const data = parsed.data;
  const scope = await validatePaperScope(data, target.id, false);
  if (!scope.ok) return scope;
  const { actor } = await requireExamManager();
  const before = toSafePaper(target);
  const row = await prisma.examPaper.update({
    data: {
      classId: data.classId,
      date: toMidnightUTC(data.date),
      durationMin: data.durationMin,
      examId: data.examId,
      maxHundredths: toMarksHundredths(data.maxMarks),
      passHundredths: toMarksHundredths(data.passMarks),
      subjectId: data.subjectId,
    },
    where: { id: target.id },
  });
  const minimal = toMinimalAuditChange(before, toSafePaper(row));
  await logAudit({
    action: "update",
    actor,
    after: minimal.after,
    before: minimal.before,
    entity: "exam-paper",
    entityId: row.id,
  });
  return { ok: true, paper: { id: row.id } };
};

export type ComponentsResult =
  { ok: true } | { errors: Record<string, string>; ok: false };

export const savePaperComponents = async (
  input: paperComponentsType,
): Promise<ComponentsResult> => {
  const parsed = paperComponentsSchema.safeParse(input);
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
  const paper = await prisma.examPaper.findUnique({
    include: { components: true, exam: true },
    where: { id: parsed.data.paperId },
  });
  if (!paper) {
    return { errors: { root: "This paper no longer exists." }, ok: false };
  }
  if (paper.exam.status === "LOCKED" || paper.exam.status === "FINALIZED") {
    return {
      errors: { root: "Locked or finalized exams cannot change components." },
      ok: false,
    };
  }
  const kinds = parsed.data.components.map((row) => row.kind);
  if (new Set(kinds).size !== kinds.length) {
    return {
      errors: { root: "Each component kind may appear only once." },
      ok: false,
    };
  }
  if (parsed.data.components.length > 0) {
    const maxSum = parsed.data.components.reduce(
      (sum, row) => sum + toMarksHundredths(row.maxMarks),
      0,
    );
    const passSum = parsed.data.components.reduce(
      (sum, row) => sum + toMarksHundredths(row.passMarks),
      0,
    );
    if (maxSum !== paper.maxHundredths || passSum !== paper.passHundredths) {
      return {
        errors: {
          root: "Component totals must match the paper max plus pass exactly.",
        },
        ok: false,
      };
    }
  }
  const { actor } = await requireExamManager();
  await prisma.$transaction([
    prisma.paperComponent.deleteMany({ where: { paperId: paper.id } }),
    ...(parsed.data.components.length > 0 ?
      [
        prisma.paperComponent.createMany({
          data: parsed.data.components.map((row) => ({
            kind: row.kind as never,
            maxHundredths: toMarksHundredths(row.maxMarks),
            paperId: paper.id,
            passHundredths: toMarksHundredths(row.passMarks),
          })),
        }),
      ]
    : []),
  ]);
  await logAudit({
    action: "update",
    actor,
    after: {
      components: parsed.data.components.map((row) => ({
        kind: row.kind,
        maxMarks: row.maxMarks,
        passMarks: row.passMarks,
      })),
      paperId: paper.id,
    },
    before: {
      components: paper.components.map((row) => ({
        kind: row.kind,
        maxHundredths: row.maxHundredths,
        passHundredths: row.passHundredths,
      })),
      paperId: paper.id,
    },
    entity: "paper-component",
    entityId: paper.id,
  });
  return { ok: true };
};
