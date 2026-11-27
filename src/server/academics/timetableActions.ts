"use server";

import { Prisma } from "@generated/prisma/client";

import { can } from "@/lib/auth/permissions";
import {
  substitutionSchema,
  timetableSlotSchema,
  type substitutionType,
  type timetableSlotType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import {
  createApprovalRequest,
  decideApproval,
} from "@/server/admin/roleActions";
import { assertTeacherScope } from "@/server/academics/scopeHelpers";
import {
  ForbiddenError,
  getFreshRoleContext,
  requirePermission,
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

const toSafeSlot = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "classId",
    "dayOfWeek",
    "endTime",
    "periodNo",
    "sectionId",
    "startTime",
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
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root");
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
};

const requireTimetableManager = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const allowed =
    active !== null &&
    (can(active, "academic:manage-timetable") ||
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
        permission: "academic:manage-timetable",
        reason: "timetable-write-denied",
      },
      before: null,
      entity: "timetable-slot",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-timetable");
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

const requireSubstitutionProposer = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const allowed =
    active !== null &&
    (can(active, "academic:manage-timetable") ||
      can(active, "academic:manage-curriculum") ||
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
        permission: "academic:manage-timetable",
        reason: "substitution-propose-denied",
      },
      before: null,
      entity: "substitution",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-timetable");
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

const validateSlotCore = async (
  data: timetableSlotType,
  excludeId?: string,
): Promise<{ errors: Record<string, string>; ok: false } | { ok: true }> => {
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
  const { parseRoleNames } = await import("@/lib/auth/permissions");
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
  const clash = await prisma.timetableSlot.findFirst({
    select: { id: true },
    where: {
      dayOfWeek: data.dayOfWeek,
      periodNo: data.periodNo,
      teacherId: data.teacherId,
      yearId: data.yearId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (clash) {
    return {
      errors: {
        teacherId: "This teacher is already booked at this day and period.",
      },
      ok: false,
    };
  }
  const duplicate = await prisma.timetableSlot.findFirst({
    select: { id: true },
    where: {
      classId: data.classId,
      dayOfWeek: data.dayOfWeek,
      periodNo: data.periodNo,
      sectionId: data.sectionId,
      yearId: data.yearId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (duplicate) {
    return {
      errors: {
        periodNo: "This class section already has this day and period.",
      },
      ok: false,
    };
  }
  return { ok: true };
};

const denyClashAudit = async (input: {
  actor: { email: string; id: string; role: string | null | undefined };
  teacherId: string;
}) => {
  await logAudit({
    action: "permission-deny",
    actor: input.actor,
    after: {
      blocked: true,
      reason: "timetable-clash",
      teacherId: input.teacherId,
    },
    before: null,
    entity: "timetable-slot",
    entityId: null,
  });
};

export type TimetableResult =
  | { ok: true; slot: { id: string } }
  | { errors: Record<string, string>; ok: false };

export const createTimetableSlot = async (
  input: timetableSlotType,
): Promise<TimetableResult> => {
  const { actor } = await requireTimetableManager();
  const parsed = timetableSlotSchema.safeParse(input);
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
  const check = await validateSlotCore(parsed.data);
  if (!check.ok) {
    if (check.errors.teacherId?.includes("already booked")) {
      await denyClashAudit({ actor, teacherId: parsed.data.teacherId });
    }
    return { errors: check.errors, ok: false };
  }
  try {
    const row = await prisma.timetableSlot.create({
      data: {
        classId: parsed.data.classId,
        dayOfWeek: parsed.data.dayOfWeek,
        endTime: parsed.data.endTime.trim(),
        periodNo: parsed.data.periodNo,
        sectionId: parsed.data.sectionId,
        startTime: parsed.data.startTime.trim(),
        subjectId: parsed.data.subjectId,
        teacherId: parsed.data.teacherId,
        yearId: parsed.data.yearId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeSlot(row),
      before: null,
      entity: "timetable-slot",
      entityId: row.id,
    });
    return { ok: true, slot: { id: row.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          periodNo: "This class section already has this day and period.",
        },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this slot. Try again." },
      ok: false,
    };
  }
};

export const updateTimetableSlot = async (
  input: timetableSlotType & { id: string },
): Promise<TimetableResult> => {
  const { actor } = await requireTimetableManager();
  if (!input.id) {
    return { errors: { root: "Missing slot id." }, ok: false };
  }
  const parsed = timetableSlotSchema.safeParse(input);
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
  const target = await prisma.timetableSlot.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This slot no longer exists." }, ok: false };
  }
  const check = await validateSlotCore(parsed.data, target.id);
  if (!check.ok) {
    if (check.errors.teacherId?.includes("already booked")) {
      await denyClashAudit({ actor, teacherId: parsed.data.teacherId });
    }
    return { errors: check.errors, ok: false };
  }
  try {
    const before = toSafeSlot(target);
    const row = await prisma.timetableSlot.update({
      data: {
        classId: parsed.data.classId,
        dayOfWeek: parsed.data.dayOfWeek,
        endTime: parsed.data.endTime.trim(),
        periodNo: parsed.data.periodNo,
        sectionId: parsed.data.sectionId,
        startTime: parsed.data.startTime.trim(),
        subjectId: parsed.data.subjectId,
        teacherId: parsed.data.teacherId,
        yearId: parsed.data.yearId,
      },
      where: { id: target.id },
    });
    const minimal = toMinimalAuditChange(before, toSafeSlot(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "timetable-slot",
      entityId: row.id,
    });
    return { ok: true, slot: { id: row.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          periodNo: "This class section already has this day and period.",
        },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not update this slot. Try again." },
      ok: false,
    };
  }
};

export const getTimetableGrid = async (input: {
  classId: string;
  sectionId: string;
  yearId: string;
}): Promise<
  | { ok: true; slots: Record<string, unknown>[] }
  | { errors: Record<string, string>; ok: false }
> => {
  await requirePermission("academic:view");
  const slots = await prisma.timetableSlot.findMany({
    include: {
      subject: { select: { code: true, name: true } },
      teacher: { select: { email: true, name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }],
    where: {
      classId: input.classId,
      sectionId: input.sectionId,
      yearId: input.yearId,
    },
  });
  return {
    ok: true,
    slots: slots.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      endTime: slot.endTime,
      id: slot.id,
      periodNo: slot.periodNo,
      startTime: slot.startTime,
      subjectName: `${slot.subject.name} (${slot.subject.code})`,
      teacherName: slot.teacher.name,
    })),
  };
};

const checkCoverScope = async (input: {
  classId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  yearId: string;
}): Promise<void> => {
  const section = await prisma.section.findUnique({
    where: { id: input.sectionId },
  });
  if (section && section.classTeacherId === input.teacherId) return;
  await assertTeacherScope({
    classId: input.classId,
    sectionId: input.sectionId,
    subjectId: input.subjectId,
    userId: input.teacherId,
    yearId: input.yearId,
  });
};

export type SubstitutionResult =
  | { approvalId: string; ok: true; substitution: { id: string } }
  | { errors: Record<string, string>; ok: false };

export const proposeSubstitution = async (
  input: substitutionType,
): Promise<SubstitutionResult> => {
  const { session } = await requireSubstitutionProposer();
  const parsed = substitutionSchema.safeParse(input);
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
  if (
    !datePattern.test(parsed.data.date) ||
    !isValidCalendarDate(parsed.data.date)
  ) {
    return { errors: { date: "Pick a valid date." }, ok: false };
  }
  const target = new Date(`${parsed.data.date}T00:00:00Z`);
  const slot = await prisma.timetableSlot.findUnique({
    where: { id: parsed.data.slotId },
  });
  if (!slot) {
    return { errors: { slotId: "This slot no longer exists." }, ok: false };
  }
  const year = await prisma.academicYear.findUnique({
    where: { id: slot.yearId },
  });
  if (!year || year.status === "CLOSED") {
    return { errors: { slotId: "This academic year is closed." }, ok: false };
  }
  const workingDay = await prisma.workingDay.findUnique({
    where: { yearId_date: { date: target, yearId: slot.yearId } },
  });
  if (
    workingDay &&
    (workingDay.type === "HOLIDAY" || workingDay.type === "EXAM_BREAK")
  ) {
    return {
      errors: { date: "No cover on holidays or exam breaks." },
      ok: false,
    };
  }
  try {
    await checkCoverScope({
      classId: slot.classId,
      sectionId: slot.sectionId,
      subjectId: slot.subjectId,
      teacherId: parsed.data.coverTeacherId,
      yearId: slot.yearId,
    });
  } catch {
    return {
      errors: { coverTeacherId: "Cover teacher lacks scope for this class." },
      ok: false,
    };
  }
  const sameSlotClash = await prisma.timetableSlot.findFirst({
    select: { id: true },
    where: {
      dayOfWeek: slot.dayOfWeek,
      periodNo: slot.periodNo,
      teacherId: parsed.data.coverTeacherId,
      yearId: slot.yearId,
    },
  });
  if (sameSlotClash) {
    await logAudit({
      action: "permission-deny",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: {
        blocked: true,
        coverTeacherId: parsed.data.coverTeacherId,
        reason: "substitution-clash",
        slotId: slot.id,
      },
      before: null,
      entity: "substitution",
      entityId: null,
    });
    return {
      errors: {
        coverTeacherId: "Cover teacher is already booked at this period.",
      },
      ok: false,
    };
  }
  const existing = await prisma.substitution.findUnique({
    where: { slotId_date: { date: target, slotId: slot.id } },
  });
  if (existing) {
    return {
      errors: { date: "A cover already exists for this slot and date." },
      ok: false,
    };
  }
  const row = await prisma.substitution.create({
    data: {
      coverTeacherId: parsed.data.coverTeacherId,
      date: target,
      reason: parsed.data.reason.trim(),
      requestedBy: session.user.id,
      slotId: slot.id,
      status: "PENDING",
    },
  });
  await logAudit({
    action: "create",
    actor: { id: session.user.id },
    after: {
      coverTeacherId: row.coverTeacherId,
      date: target.toISOString().slice(0, 10),
      slotId: row.slotId,
      status: row.status,
    },
    before: null,
    entity: "substitution",
    entityId: row.id,
  });
  const approvalId = await createApprovalRequest({
    action: "timetable_change",
    payload: {
      coverTeacherId: row.coverTeacherId,
      date: parsed.data.date,
      reason: parsed.data.reason.trim().slice(0, 500),
      slotId: slot.id,
      substitutionId: row.id,
    },
    requestedBy: session.user.id,
  });
  await prisma.substitution.update({
    data: { approvalId },
    where: { id: row.id },
  });
  return { approvalId, ok: true, substitution: { id: row.id } };
};

export const decideSubstitutionApproval = async (input: {
  decision: "APPROVE" | "REJECT";
  id: string;
  reason?: string | undefined;
}): Promise<
  | { approvalId: string; ok: true; status: "APPROVED" | "REJECTED" }
  | { errors: Record<string, string>; ok: false }
> => {
  const { session } = await requireTimetableManager();
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: input.id },
  });
  if (!approval || approval.action !== "timetable_change") {
    return { errors: { root: "This request no longer exists." }, ok: false };
  }
  if (approval.status !== "PENDING") {
    return {
      errors: { root: "This request is no longer pending." },
      ok: false,
    };
  }
  const outcome = await decideApproval({
    approvalId: approval.id,
    deciderId: session.user.id,
    decision: input.decision,
    reason: input.reason,
  });
  const fresh = await prisma.approvalRequest.findUnique({
    where: { id: approval.id },
  });
  if (fresh?.status === "REJECTED") {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const substitutionId =
      typeof payload.substitutionId === "string" ?
        payload.substitutionId
      : null;
    if (substitutionId) {
      await prisma.substitution.updateMany({
        data: { decidedBy: session.user.id, status: "REJECTED" },
        where: { id: substitutionId },
      });
    }
    await logAudit({
      action: "approval-reject",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: { action: approval.action, status: "REJECTED" },
      before: null,
      entity: "substitution",
      entityId: substitutionId,
    });
    return { approvalId: fresh.id, ok: true, status: "REJECTED" };
  }
  if (fresh?.status === "APPROVED") {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const substitutionId =
      typeof payload.substitutionId === "string" ?
        payload.substitutionId
      : null;
    if (substitutionId) {
      await prisma.substitution.updateMany({
        data: { decidedBy: session.user.id, status: "APPROVED" },
        where: { id: substitutionId, status: "PENDING" },
      });
    }
    await logAudit({
      action: "approval-approve",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: { action: approval.action, status: "APPROVED" },
      before: { action: approval.action, status: "PENDING" },
      entity: "substitution",
      entityId: substitutionId,
    });
    return { approvalId: fresh.id, ok: true, status: "APPROVED" };
  }
  if (outcome.kind === "DENY") {
    return { errors: { root: outcome.reason }, ok: false };
  }
  return { errors: { root: "Could not decide this request." }, ok: false };
};

export const applySubstitutionApproval = async (input: {
  id: string;
}): Promise<{ ok: true } | { errors: Record<string, string>; ok: false }> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const allowed =
    active !== null &&
    (can(active, "academic:manage-timetable") ||
      can(active, "academic:manage-curriculum") ||
      (can(active, "system:manage") &&
        (await prisma.approvalRequest.findUnique({ where: { id: input.id } }))
          ?.status === "FAILED"));
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
        permission: "academic:manage-timetable",
        reason: "substitution-apply-denied",
      },
      before: null,
      entity: "substitution",
      entityId: input.id,
    });
    throw new ForbiddenError("academic:manage-timetable");
  }
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: input.id },
  });
  if (!approval || approval.action !== "timetable_change") {
    return { errors: { root: "This request no longer exists." }, ok: false };
  }
  if (approval.status === "PENDING") {
    return {
      errors: { root: "Approve this request before applying." },
      ok: false,
    };
  }
  if (
    approval.status === "APPLIED" ||
    approval.status === "REJECTED" ||
    approval.status === "EXPIRED"
  ) {
    return {
      errors: { root: "This request is no longer actionable." },
      ok: false,
    };
  }
  try {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const substitutionId =
      typeof payload.substitutionId === "string" ?
        payload.substitutionId
      : null;
    const slotId = typeof payload.slotId === "string" ? payload.slotId : null;
    const coverTeacherId =
      typeof payload.coverTeacherId === "string" ?
        payload.coverTeacherId
      : null;
    const dateText = typeof payload.date === "string" ? payload.date : null;
    if (!substitutionId || !slotId || !coverTeacherId || !dateText) {
      throw new Error("This substitution payload is incomplete.");
    }
    const slot = await prisma.timetableSlot.findUnique({
      where: { id: slotId },
    });
    if (!slot) {
      throw new Error("This slot no longer exists.");
    }
    const target = new Date(`${dateText}T00:00:00Z`);
    const workingDay = await prisma.workingDay.findUnique({
      where: { yearId_date: { date: target, yearId: slot.yearId } },
    });
    if (
      workingDay &&
      (workingDay.type === "HOLIDAY" || workingDay.type === "EXAM_BREAK")
    ) {
      throw new Error("This date is now a holiday. Resubmit.");
    }
    await checkCoverScope({
      classId: slot.classId,
      sectionId: slot.sectionId,
      subjectId: slot.subjectId,
      teacherId: coverTeacherId,
      yearId: slot.yearId,
    });
    const clash = await prisma.timetableSlot.findFirst({
      select: { id: true },
      where: {
        dayOfWeek: slot.dayOfWeek,
        periodNo: slot.periodNo,
        teacherId: coverTeacherId,
        yearId: slot.yearId,
      },
    });
    if (clash) {
      throw new Error("Cover teacher is now booked at this period. Resubmit.");
    }
    await prisma.$transaction([
      prisma.substitution.update({
        data: { coverTeacherId, date: target, status: "APPLIED" },
        where: { id: substitutionId },
      }),
      prisma.approvalRequest.update({
        data: {
          appliedAt: new Date(),
          appliedBy: session.user.id,
          status: "APPLIED",
        },
        where: { id: approval.id },
      }),
    ]);
    await logAudit({
      action: "approval-apply",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: { action: approval.action, status: "APPLIED" },
      before: { action: approval.action, status: "APPROVED" },
      entity: "substitution",
      entityId: substitutionId,
    });
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Apply failed";
    await prisma.approvalRequest.update({
      data: { reason: message, status: "FAILED" },
      where: { id: approval.id },
    });
    await logAudit({
      action: "approval-failed",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: { action: approval.action, status: "FAILED" },
      before: { action: approval.action, status: approval.status },
      entity: "substitution",
      entityId: approval.id,
    });
    return { errors: { root: message }, ok: false };
  }
};
