"use server";

import { can } from "@/lib/auth/permissions";
import {
  leaveRequestSchema,
  staffAttendanceSchema,
  type leaveRequestType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { isOfficeStaff } from "@/server/academics/scopeHelpers";
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

const toDayDiff = (target: string): number => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const targetDate = new Date(`${target}T00:00:00Z`);
  if (Number.isNaN(targetDate.getTime())) return Number.NaN;
  targetDate.setUTCHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - targetDate.getTime()) / 86400000);
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

const requireStaffMarker = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const allowed =
    active !== null &&
    (isOfficeStaff(active) ||
      can(active, "academic:manage-attendance") ||
      can(active, "academic:manage-discipline") ||
      can(active, "academic:manage-curriculum"));
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
        permission: "academic:manage-attendance",
        reason: "staff-attendance-denied",
      },
      before: null,
      entity: "staff-attendance",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-attendance");
  }
  return {
    actor: {
      email: session.user.email,
      id: session.user.id,
      role: session.user.role,
    },
    session,
  };
};

const requireLeaveDecider = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const allowed =
    active !== null &&
    (can(active, "academic:manage-attendance") ||
      can(active, "academic:manage-discipline") ||
      can(active, "academic:manage-curriculum"));
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
        permission: "academic:manage-attendance",
        reason: "leave-decide-denied",
      },
      before: null,
      entity: "leave-request",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-attendance");
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

export type StaffAttendanceResult =
  { marked: number; ok: true } | { errors: Record<string, string>; ok: false };

export const markStaffDay = async (input: {
  date: string;
  rows: { staffId: string; status: "PRESENT" | "LEAVE" | "ON_DUTY" }[];
}): Promise<StaffAttendanceResult> => {
  const { actor } = await requireStaffMarker();
  if (!datePattern.test(input.date) || !isValidCalendarDate(input.date)) {
    return { errors: { date: "Pick a valid date." }, ok: false };
  }
  const diff = toDayDiff(input.date);
  if (Number.isNaN(diff) || diff < 0) {
    return {
      errors: { date: "Staff attendance cannot be marked for the future." },
      ok: false,
    };
  }
  if (input.rows.length === 0 || input.rows.length > 300) {
    return { errors: { root: "Add between 1 and 300 staff rows." }, ok: false };
  }
  const target = toMidnightUTC(input.date);
  let marked = 0;
  for (const row of input.rows) {
    const parsed = staffAttendanceSchema.safeParse({
      date: input.date,
      staffId: row.staffId,
      status: row.status,
    });
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
    const staff = await prisma.staffProfile.findUnique({
      where: { id: row.staffId },
    });
    if (!staff || !staff.isActive) {
      return {
        errors: { root: "One or more staff records are invalid." },
        ok: false,
      };
    }
    if (row.status === "LEAVE") {
      const approved = await prisma.leaveRequest.findFirst({
        where: {
          endDate: { gte: target },
          startDate: { lte: target },
          staffId: row.staffId,
          status: "APPROVED",
          target: "STAFF",
        },
      });
      if (!approved) {
        return {
          errors: {
            root: "Staff leave without approval does not mark attendance.",
          },
          ok: false,
        };
      }
    }
    const existing = await prisma.staffAttendance.findUnique({
      where: { staffId_date: { date: target, staffId: row.staffId } },
    });
    if (existing) {
      if (existing.status !== row.status) {
        const before = { status: existing.status };
        const updated = await prisma.staffAttendance.update({
          data: { markedBy: actor.id, status: row.status },
          where: { id: existing.id },
        });
        const minimal = toMinimalAuditChange(before, {
          status: updated.status,
        });
        await logAudit({
          action: "update",
          actor,
          after: minimal.after,
          before: minimal.before,
          entity: "staff-attendance",
          entityId: updated.id,
        });
        marked += 1;
      }
    } else {
      const created = await prisma.staffAttendance.create({
        data: {
          date: target,
          markedBy: actor.id,
          staffId: row.staffId,
          status: row.status,
        },
      });
      await logAudit({
        action: "create",
        actor,
        after: { date: input.date, staffId: row.staffId, status: row.status },
        before: null,
        entity: "staff-attendance",
        entityId: created.id,
      });
      marked += 1;
    }
  }
  return { marked, ok: true };
};

export type LeaveResult =
  | { leave: { id: string }; ok: true }
  | { errors: Record<string, string>; ok: false };

export const requestLeave = async (
  input: leaveRequestType,
): Promise<LeaveResult> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const parsed = leaveRequestSchema.safeParse(input);
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
  if (
    !datePattern.test(data.startDate) ||
    !isValidCalendarDate(data.startDate)
  ) {
    return { errors: { startDate: "Pick a valid start date." }, ok: false };
  }
  if (!datePattern.test(data.endDate) || !isValidCalendarDate(data.endDate)) {
    return { errors: { endDate: "Pick a valid end date." }, ok: false };
  }
  if (data.target === "STUDENT") {
    const student = await prisma.studentProfile.findUnique({
      where: { id: data.studentId ?? "" },
    });
    if (!student) {
      return {
        errors: { studentId: "This student no longer exists." },
        ok: false,
      };
    }
    const guardian = await prisma.guardian.findFirst({
      where: { userId: session.user.id },
    });
    const linked =
      guardian ?
        await prisma.studentGuardianLink.findUnique({
          where: {
            studentId_guardianId: {
              guardianId: guardian.id,
              studentId: student.id,
            },
          },
        })
      : null;
    const staffAllowed =
      active !== null &&
      (isOfficeStaff(active) ||
        can(active, "academic:manage-attendance") ||
        can(active, "academic:manage-discipline") ||
        can(active, "academic:manage-curriculum"));
    if (!linked && !staffAllowed) {
      await logAudit({
        action: "permission-deny",
        actor: {
          email: session.user.email,
          id: session.user.id,
          role: session.user.role,
        },
        after: {
          blocked: true,
          reason: "leave-student-denied",
          studentId: student.id,
        },
        before: null,
        entity: "leave-request",
        entityId: null,
      });
      throw new ForbiddenError("academic:view");
    }
  } else {
    const staff = await prisma.staffProfile.findUnique({
      where: { id: data.staffId ?? "" },
    });
    if (!staff) {
      return {
        errors: { staffId: "This staff member no longer exists." },
        ok: false,
      };
    }
    const self = staff.userId === session.user.id;
    const staffAllowed =
      active !== null &&
      (isOfficeStaff(active) ||
        can(active, "academic:manage-attendance") ||
        can(active, "academic:manage-discipline") ||
        can(active, "academic:manage-curriculum"));
    if (!self && !staffAllowed) {
      await logAudit({
        action: "permission-deny",
        actor: {
          email: session.user.email,
          id: session.user.id,
          role: session.user.role,
        },
        after: {
          blocked: true,
          reason: "leave-staff-denied",
          staffId: staff.id,
        },
        before: null,
        entity: "leave-request",
        entityId: null,
      });
      throw new ForbiddenError("academic:view");
    }
  }
  const row = await prisma.leaveRequest.create({
    data: {
      endDate: toMidnightUTC(data.endDate),
      reason: data.reason.trim(),
      requestedBy: session.user.id,
      staffId: data.target === "STAFF" ? data.staffId?.trim() || null : null,
      startDate: toMidnightUTC(data.startDate),
      status: "PENDING",
      studentId:
        data.target === "STUDENT" ? data.studentId?.trim() || null : null,
      target: data.target,
    },
  });
  await logAudit({
    action: "create",
    actor: { id: session.user.id },
    after: {
      endDate: data.endDate,
      startDate: data.startDate,
      status: row.status,
      target: row.target,
    },
    before: null,
    entity: "leave-request",
    entityId: row.id,
  });
  return { leave: { id: row.id }, ok: true };
};

export const decideLeave = async (input: {
  decision: "APPROVE" | "REJECT";
  id: string;
  reason?: string | undefined;
}): Promise<LeaveResult> => {
  const { actor } = await requireLeaveDecider();
  const target = await prisma.leaveRequest.findUnique({
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
  if (target.requestedBy === actor.id) {
    await logAudit({
      action: "permission-deny",
      actor,
      after: { blocked: true, reason: "self-approval-blocked" },
      before: { status: target.status },
      entity: "leave-request",
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
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.leaveRequest.update({
      data: {
        decidedAt: new Date(),
        decidedBy: actor.id,
        status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      },
      where: { id: target.id },
    });
    await logAudit(
      {
        action:
          input.decision === "APPROVE" ? "approval-approve" : "approval-reject",
        actor,
        after: { status: next.status, target: next.target },
        before: { status: target.status },
        entity: "leave-request",
        entityId: next.id,
      },
      { db: tx },
    );
    if (input.decision === "APPROVE") {
      if (next.target === "STUDENT" && next.studentId) {
        const student = await tx.studentProfile.findUnique({
          where: { id: next.studentId },
        });
        if (student?.sectionId) {
          const cursor = new Date(next.startDate);
          cursor.setUTCHours(0, 0, 0, 0);
          const end = new Date(next.endDate);
          end.setUTCHours(0, 0, 0, 0);
          while (cursor <= end) {
            const key = cursor.toISOString().slice(0, 10);
            const dayEntry = await tx.workingDay.findUnique({
              where: {
                yearId_date: { date: new Date(cursor), yearId: student.yearId },
              },
            });
            const working =
              dayEntry ?
                dayEntry.type !== "HOLIDAY" &&
                dayEntry.type !== "EXAM_BREAK" &&
                (dayEntry.type === "WORKING_SATURDAY" ||
                  (() => {
                    const weekday = new Date(cursor).getUTCDay();
                    return weekday !== 0 && weekday !== 6;
                  })())
              : (() => {
                  const weekday = new Date(cursor).getUTCDay();
                  return weekday !== 0 && weekday !== 6;
                })();
            const diff = toDayDiff(key);
            if (working && (Number.isNaN(diff) || diff <= 7) && diff >= 0) {
              const dayStart = new Date(cursor);
              const existing = await tx.attendanceRecord.findUnique({
                where: {
                  studentId_date: { date: dayStart, studentId: student.id },
                },
              });
              const note = next.reason.slice(0, 500);
              if (existing) {
                if (
                  existing.status !== "EXCUSED" ||
                  (existing.note ?? "") !== note
                ) {
                  await tx.attendanceRecord.update({
                    data: {
                      markedBy: actor.id,
                      note,
                      status: "EXCUSED",
                    },
                    where: { id: existing.id },
                  });
                }
              } else {
                await tx.attendanceRecord.create({
                  data: {
                    classId: student.classId,
                    date: dayStart,
                    markedBy: actor.id,
                    note,
                    sectionId: student.sectionId,
                    status: "EXCUSED",
                    studentId: student.id,
                    yearId: student.yearId,
                  },
                });
              }
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }
        }
      } else if (next.target === "STAFF" && next.staffId) {
        const cursor = new Date(next.startDate);
        cursor.setUTCHours(0, 0, 0, 0);
        const end = new Date(next.endDate);
        end.setUTCHours(0, 0, 0, 0);
        while (cursor <= end) {
          const day = new Date(cursor);
          const existing = await tx.staffAttendance.findUnique({
            where: { staffId_date: { date: day, staffId: next.staffId } },
          });
          if (existing) {
            if (
              existing.status !== "LEAVE" ||
              existing.leaveRequestId !== next.id
            ) {
              await tx.staffAttendance.update({
                data: {
                  leaveRequestId: next.id,
                  markedBy: actor.id,
                  status: "LEAVE",
                },
                where: { id: existing.id },
              });
            }
          } else {
            await tx.staffAttendance.create({
              data: {
                date: day,
                leaveRequestId: next.id,
                markedBy: actor.id,
                staffId: next.staffId,
                status: "LEAVE",
              },
            });
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
    }
    return next;
  });
  return { leave: { id: updated.id }, ok: true };
};

export const getLeaveInbox = async (): Promise<
  | { leaves: Record<string, unknown>[]; ok: true }
  | { errors: Record<string, string>; ok: false }
> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const manager =
    active !== null &&
    (isOfficeStaff(active) ||
      can(active, "academic:manage-attendance") ||
      can(active, "academic:manage-discipline") ||
      can(active, "academic:manage-curriculum") ||
      can(active, "system:manage"));
  if (manager) {
    const leaves = await prisma.leaveRequest.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });
    return { leaves: leaves as unknown as Record<string, unknown>[], ok: true };
  }
  const guardian = await prisma.guardian.findFirst({
    where: { userId: session.user.id },
  });
  if (guardian) {
    const links = await prisma.studentGuardianLink.findMany({
      select: { studentId: true },
      where: { guardianId: guardian.id },
    });
    const studentIds = links.map((link) => link.studentId);
    const leaves = await prisma.leaveRequest.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      where: { studentId: { in: studentIds } },
    });
    return { leaves: leaves as unknown as Record<string, unknown>[], ok: true };
  }
  const staff = await prisma.staffProfile.findFirst({
    where: { userId: session.user.id },
  });
  if (staff) {
    const leaves = await prisma.leaveRequest.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      where: { staffId: staff.id },
    });
    return { leaves: leaves as unknown as Record<string, unknown>[], ok: true };
  }
  return { leaves: [], ok: true };
};
