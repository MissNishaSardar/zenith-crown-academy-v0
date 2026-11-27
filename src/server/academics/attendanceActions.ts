"use server";

import { Prisma } from "@generated/prisma/client";

import { can } from "@/lib/auth/permissions";
import {
  attendanceExceptionSchema,
  attendanceMarkSchema,
  type attendanceExceptionType,
  type attendanceMarkType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { createApprovalRequest } from "@/server/admin/roleActions";
import { assertTeacherScope } from "@/server/academics/scopeHelpers";
import {
  ForbiddenError,
  getFreshRoleContext,
  requirePermission,
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

const toDayDiff = (target: string): number => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const targetDate = new Date(`${target}T00:00:00Z`);
  if (Number.isNaN(targetDate.getTime())) return Number.NaN;
  targetDate.setUTCHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - targetDate.getTime()) / 86400000);
};

const toSafeRecord = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "classId",
    "date",
    "note",
    "sectionId",
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

const checkWardConflict = async (input: {
  classId: string;
  sectionId: string;
  userId: string;
  yearId: string;
}): Promise<void> => {
  const staff = await prisma.staffProfile.findFirst({
    select: { id: true, wardStudentId: true },
    where: { userId: input.userId },
  });
  if (!staff?.wardStudentId) return;
  const wardEnrollment = await prisma.enrollment.findFirst({
    select: { id: true },
    where: {
      classId: input.classId,
      sectionId: input.sectionId,
      status: { in: [...ACTIVE_ENROLLMENT] },
      studentId: staff.wardStudentId,
      yearId: input.yearId,
    },
  });
  const wardProfile =
    wardEnrollment ? null : (
      await prisma.studentProfile.findFirst({
        select: { id: true },
        where: {
          classId: input.classId,
          id: staff.wardStudentId,
          sectionId: input.sectionId,
          yearId: input.yearId,
        },
      })
    );
  if (wardEnrollment ?? wardProfile) {
    const { active } = await getFreshRoleContext(input.userId);
    const actorRow = await prisma.user.findUnique({
      select: { email: true, id: true, role: true },
      where: { id: input.userId },
    });
    await logAudit({
      action: "permission-deny",
      actor: {
        email: actorRow?.email ?? null,
        id: input.userId,
        role: actorRow?.role ?? null,
      },
      after: {
        active: active ?? null,
        blocked: true,
        classId: input.classId,
        reason: "ward-conflict-whole-class",
        sectionId: input.sectionId,
      },
      before: null,
      entity: "permission",
      entityId: input.userId,
    });
    throw new ForbiddenError("teacher-scope");
  }
};

const requireAttendanceMarker = async (input: {
  classId: string;
  sectionId: string;
  yearId: string;
}): Promise<{
  actor: { email: string; id: string; role: string | null | undefined };
  session: Awaited<ReturnType<typeof requireSession>>;
}> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role ?? null,
  };
  await checkWardConflict({
    classId: input.classId,
    sectionId: input.sectionId,
    userId: session.user.id,
    yearId: input.yearId,
  });
  if (
    active &&
    (can(active, "academic:manage-attendance") ||
      can(active, "academic:manage-curriculum"))
  ) {
    return { actor, session };
  }
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
};

export type AttendanceMarkResult =
  { ok: true; marked: number } | { errors: Record<string, string>; ok: false };

export const markAttendanceDay = async (
  input: attendanceMarkType,
): Promise<AttendanceMarkResult> => {
  const parsed = attendanceMarkSchema.safeParse(input);
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
  const diff = toDayDiff(data.date);
  if (Number.isNaN(diff)) {
    return { errors: { date: "Pick a valid date." }, ok: false };
  }
  if (diff < 0) {
    return {
      errors: { date: "Attendance cannot be marked for the future." },
      ok: false,
    };
  }
  if (diff > 7) {
    return {
      errors: {
        date: "Backdate beyond 7 days needs a backdated reopen approval.",
      },
      ok: false,
    };
  }
  const { actor } = await requireAttendanceMarker({
    classId: data.classId,
    sectionId: data.sectionId,
    yearId: data.yearId,
  });
  const year = await prisma.academicYear.findUnique({
    where: { id: data.yearId },
  });
  if (!year) {
    return { errors: { yearId: "Pick a valid academic year." }, ok: false };
  }
  if (year.status === "CLOSED") {
    return { errors: { yearId: "This academic year is closed." }, ok: false };
  }
  const section = await prisma.section.findUnique({
    where: { id: data.sectionId },
  });
  if (
    !section ||
    section.yearId !== data.yearId ||
    section.classId !== data.classId
  ) {
    return {
      errors: { sectionId: "This section does not belong to the class year." },
      ok: false,
    };
  }
  const target = toMidnightUTC(data.date);
  const dayKey = data.date;
  const workingDay = await prisma.workingDay.findUnique({
    where: { yearId_date: { date: target, yearId: data.yearId } },
  });
  if (
    workingDay &&
    (workingDay.type === "HOLIDAY" || workingDay.type === "EXAM_BREAK")
  ) {
    return {
      errors: { date: "No attendance on holidays or exam breaks." },
      ok: false,
    };
  }
  const weekday = target.getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;
  if (isWeekend && (!workingDay || workingDay.type !== "WORKING_SATURDAY")) {
    return {
      errors: { date: "School week is Monday to Friday." },
      ok: false,
    };
  }
  const enrollments = await prisma.enrollment.findMany({
    select: { studentId: true },
    where: {
      sectionId: data.sectionId,
      status: { in: [...ACTIVE_ENROLLMENT] },
      yearId: data.yearId,
    },
  });
  const enrolled = new Set(enrollments.map((row) => row.studentId));
  for (const row of data.rows) {
    if (!enrolled.has(row.studentId)) {
      return {
        errors: {
          root: "One or more students are not enrolled in this section.",
        },
        ok: false,
      };
    }
    if (row.status === "EXCUSED" && (row.note ?? "").trim() === "") {
      return {
        errors: { root: "Add a note for excused absence." },
        ok: false,
      };
    }
  }
  try {
    const marked = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const row of data.rows) {
        const existing = await tx.attendanceRecord.findUnique({
          where: { studentId_date: { date: target, studentId: row.studentId } },
        });
        const note =
          (row.note ?? "").trim() === "" ? null : (row.note?.trim() ?? null);
        if (existing) {
          if (
            existing.status !== row.status ||
            (existing.note ?? null) !== note ||
            existing.sectionId !== data.sectionId ||
            existing.classId !== data.classId ||
            existing.yearId !== data.yearId
          ) {
            const before = toSafeRecord(existing);
            const updated = await tx.attendanceRecord.update({
              data: {
                classId: data.classId,
                markedBy: actor.id,
                note,
                sectionId: data.sectionId,
                status: row.status,
                yearId: data.yearId,
              },
              where: { id: existing.id },
            });
            const minimal = toMinimalAuditChange(before, toSafeRecord(updated));
            await logAudit(
              {
                action: "update",
                actor,
                after: minimal.after,
                before: minimal.before,
                entity: "attendance-record",
                entityId: updated.id,
              },
              { db: tx },
            );
            count += 1;
          }
        } else {
          const created = await tx.attendanceRecord.create({
            data: {
              classId: data.classId,
              date: target,
              markedBy: actor.id,
              note,
              sectionId: data.sectionId,
              status: row.status,
              studentId: row.studentId,
              yearId: data.yearId,
            },
          });
          await logAudit(
            {
              action: "create",
              actor,
              after: toSafeRecord(created),
              before: null,
              entity: "attendance-record",
              entityId: created.id,
            },
            { db: tx },
          );
          count += 1;
        }
      }
      return count;
    });
    void dayKey;
    return { marked, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          root: "Duplicate attendance entry for this student and date.",
        },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not save attendance. Try again." },
      ok: false,
    };
  }
};

export type AttendanceDayRow = {
  enrollmentId: string;
  note: string | null;
  rollNo: string;
  status: string | null;
  studentId: string;
  studentName: string;
};

export const getAttendanceDay = async (input: {
  classId: string;
  date: string;
  sectionId: string;
  yearId: string;
}): Promise<
  | { ok: true; rows: AttendanceDayRow[] }
  | { errors: Record<string, string>; ok: false }
> => {
  await requireAttendanceMarker({
    classId: input.classId,
    sectionId: input.sectionId,
    yearId: input.yearId,
  });
  if (!datePattern.test(input.date) || !isValidCalendarDate(input.date)) {
    return { errors: { date: "Pick a valid date." }, ok: false };
  }
  const target = toMidnightUTC(input.date);
  const enrollments = await prisma.enrollment.findMany({
    include: {
      student: { select: { firstName: true, id: true, lastName: true } },
    },
    orderBy: [{ rollNo: "asc" }, { id: "asc" }],
    where: {
      classId: input.classId,
      sectionId: input.sectionId,
      status: { in: [...ACTIVE_ENROLLMENT] },
      yearId: input.yearId,
    },
  });
  const records = await prisma.attendanceRecord.findMany({
    where: {
      classId: input.classId,
      date: target,
      sectionId: input.sectionId,
      yearId: input.yearId,
    },
  });
  const byStudent = new Map(records.map((row) => [row.studentId, row]));
  const rows = enrollments.map((enrollment) => {
    const existing = byStudent.get(enrollment.studentId);
    return {
      enrollmentId: enrollment.id,
      note: existing?.note ?? null,
      rollNo: enrollment.rollNo,
      status: existing?.status ?? null,
      studentId: enrollment.studentId,
      studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
    };
  });
  return { ok: true, rows };
};

export const getWorkingDayDenominator = async (input: {
  asOf?: string | undefined;
  yearId: string;
}): Promise<
  | { ok: true; denominator: number; holidays: number }
  | { errors: Record<string, string>; ok: false }
> => {
  await requirePermission("academic:view");
  const year = await prisma.academicYear.findUnique({
    where: { id: input.yearId },
  });
  if (!year) {
    return { errors: { yearId: "Pick a valid academic year." }, ok: false };
  }
  const end =
    (
      input.asOf &&
      datePattern.test(input.asOf) &&
      isValidCalendarDate(input.asOf)
    ) ?
      toMidnightUTC(input.asOf)
    : new Date();
  const start = new Date(year.startDate);
  start.setUTCHours(0, 0, 0, 0);
  const cappedEnd = new Date(
    Math.min(end.getTime(), new Date(year.endDate).getTime()),
  );
  cappedEnd.setUTCHours(0, 0, 0, 0);
  const days = await prisma.workingDay.findMany({
    where: { yearId: input.yearId },
  });
  const byDate = new Map(
    days.map((row) => [row.date.toISOString().slice(0, 10), row.type]),
  );
  let denominator = 0;
  let holidays = 0;
  const cursor = new Date(start);
  while (cursor <= cappedEnd) {
    const key = cursor.toISOString().slice(0, 10);
    const type = byDate.get(key);
    const weekday = cursor.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (type === "HOLIDAY" || type === "EXAM_BREAK") {
      holidays += 1;
    } else if (type === "WORKING_SATURDAY") {
      denominator += 1;
    } else if (!isWeekend) {
      denominator += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { denominator, holidays, ok: true };
};

export const getStudentAttendanceRate = async (input: {
  asOf?: string | undefined;
  studentId: string;
  yearId: string;
}): Promise<
  | {
      absent: number;
      denominator: number;
      ok: true;
      present: number;
      rateHundredths: number;
    }
  | { errors: Record<string, string>; ok: false }
> => {
  await requirePermission("academic:view");
  const denominatorResult = await getWorkingDayDenominator({
    asOf: input.asOf,
    yearId: input.yearId,
  });
  if (!denominatorResult.ok) return denominatorResult;
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: input.studentId, yearId: input.yearId },
  });
  let present = 0;
  let absent = 0;
  for (const row of records) {
    if (
      row.status === "PRESENT" ||
      row.status === "LATE" ||
      row.status === "EXCUSED"
    ) {
      present += 1;
    } else if (row.status === "ABSENT") {
      absent += 1;
    }
  }
  const denominator = denominatorResult.denominator;
  const rateHundredths =
    denominator > 0 ? Math.round((present * 10000) / denominator) : 0;
  return { absent, denominator, ok: true, present, rateHundredths };
};

export type AttendanceExceptionResult =
  | { exception: { id: string }; ok: true }
  | { errors: Record<string, string>; ok: false };

export const requestAttendanceException = async (
  input: attendanceExceptionType,
): Promise<AttendanceExceptionResult> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (
    !active ||
    (!can(active, "academic:manage-attendance") &&
      !can(active, "academic:manage-curriculum"))
  ) {
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
        permission: "academic:manage-attendance",
        reason: "attendance-exception-denied",
      },
      before: null,
      entity: "attendance-exception",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-attendance");
  }
  const parsed = attendanceExceptionSchema.safeParse(input);
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
  const student = await prisma.studentProfile.findUnique({
    where: { id: parsed.data.studentId },
  });
  if (!student) {
    return {
      errors: { studentId: "This student no longer exists." },
      ok: false,
    };
  }
  const row = await prisma.attendanceException.create({
    data: {
      classId: parsed.data.classId,
      denominator: parsed.data.denominator,
      examTerm: parsed.data.examTerm.trim(),
      rateHundredths: parsed.data.rateHundredths,
      reason: parsed.data.reason.trim(),
      recommendedBy: session.user.id,
      status: "PENDING",
      studentId: parsed.data.studentId,
      yearId: parsed.data.yearId,
    },
  });
  await logAudit({
    action: "create",
    actor: { id: session.user.id },
    after: {
      classId: row.classId,
      examTerm: row.examTerm,
      status: row.status,
      studentId: row.studentId,
      yearId: row.yearId,
    },
    before: null,
    entity: "attendance-exception",
    entityId: row.id,
  });
  return { exception: { id: row.id }, ok: true };
};

export const decideAttendanceException = async (input: {
  decision: "APPROVE" | "REJECT";
  id: string;
  reason?: string | undefined;
}): Promise<AttendanceExceptionResult> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (!active || !can(active, "academic:manage-curriculum")) {
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
        reason: "attendance-exception-decide-denied",
      },
      before: null,
      entity: "attendance-exception",
      entityId: input.id,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  const target = await prisma.attendanceException.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This request no longer exists." }, ok: false };
  }
  if (target.status !== "PENDING") {
    return {
      errors: { root: "This request is no longer pending." },
      ok: false,
    };
  }
  if (target.recommendedBy === session.user.id) {
    await logAudit({
      action: "approval-decide",
      actor: { id: session.user.id },
      after: { blocked: true, reason: "self-approval-blocked" },
      before: { status: target.status },
      entity: "attendance-exception",
      entityId: target.id,
    });
    return {
      errors: { root: "You cannot approve your own request." },
      ok: false,
    };
  }
  if (input.decision === "REJECT" && !(input.reason ?? "").trim()) {
    return { errors: { reason: "A reason is required to reject." }, ok: false };
  }
  const before = { status: target.status };
  const updated = await prisma.attendanceException.update({
    data: {
      decidedAt: new Date(),
      decidedBy: session.user.id,
      status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
    },
    where: { id: target.id },
  });
  const minimal = toMinimalAuditChange(before, { status: updated.status });
  await logAudit({
    action:
      input.decision === "APPROVE" ? "approval-approve" : "approval-reject",
    actor: { id: session.user.id },
    after: minimal.after,
    before: minimal.before,
    entity: "attendance-exception",
    entityId: updated.id,
  });
  return { exception: { id: updated.id }, ok: true };
};

export const requestBackdateReopen = async (input: {
  classId: string;
  date: string;
  reason: string;
  sectionId: string;
  yearId: string;
}): Promise<
  | { ok: true; approvalId: string }
  | { errors: Record<string, string>; ok: false }
> => {
  const session = await requireSession();
  if (!datePattern.test(input.date) || !isValidCalendarDate(input.date)) {
    return { errors: { date: "Pick a valid date." }, ok: false };
  }
  const reason = input.reason.trim();
  if (!reason) {
    return { errors: { reason: "Enter a reason." }, ok: false };
  }
  if (reason.length > 500) {
    return { errors: { reason: "Reason is too long." }, ok: false };
  }
  await checkWardConflict({
    classId: input.classId,
    sectionId: input.sectionId,
    userId: session.user.id,
    yearId: input.yearId,
  });
  const approvalId = await createApprovalRequest({
    action: "attendance_backdate_reopen",
    payload: {
      classId: input.classId,
      date: input.date,
      reason: reason.slice(0, 500),
      sectionId: input.sectionId,
      yearId: input.yearId,
    },
    requestedBy: session.user.id,
  });
  return { approvalId, ok: true };
};
