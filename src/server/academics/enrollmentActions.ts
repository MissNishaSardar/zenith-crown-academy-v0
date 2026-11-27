"use server";

import { Prisma } from "@generated/prisma/client";

import { can } from "@/lib/auth/permissions";
import {
  enrollmentSchema,
  isSeniorSecondaryOrder,
  transferRequestSchema,
  withdrawalRequestSchema,
  type enrollmentType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import {
  createApprovalRequest,
  decideApproval,
} from "@/server/admin/roleActions";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

export type EnrollmentResult =
  | { ok: true; enrollment: { id: string; rollNo: string } }
  | {
      errors: Partial<
        Record<
          | "classId"
          | "rollNo"
          | "root"
          | "sectionId"
          | "status"
          | "streamId"
          | "studentId"
          | "subjectPickIds"
          | "yearId",
          string
        >
      >;
      ok: false;
    };

export type EnrollmentRequestResult =
  | { ok: true; approvalId: string }
  | {
      errors: Partial<
        Record<"enrollmentId" | "reason" | "root" | "targetSectionId", string>
      >;
      ok: false;
    };

export type EnrollmentDecideResult =
  | { approvalId: string; ok: true; status: "APPROVED" | "REJECTED" }
  | {
      errors: Partial<Record<"id" | "decision" | "reason" | "root", string>>;
      ok: false;
    };

export type EnrollmentApplyResult =
  { ok: true } | { errors: Partial<Record<"id" | "root", string>>; ok: false };

type EnrollmentErrorMap = Extract<EnrollmentResult, { ok: false }>["errors"];

const ACTIVE_STATUSES = ["ENROLLED", "PROMOTED", "REPEATED"] as const;

const toSafeEnrollment = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "classId",
    "rollNo",
    "sectionId",
    "status",
    "streamId",
    "studentId",
    "yearId",
  ]) {
    out[field] = record[field] ?? null;
  }
  return out;
};

const toFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): EnrollmentErrorMap => {
  const fieldErrors: EnrollmentErrorMap = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof EnrollmentErrorMap;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

const requireEnrollmentWrite = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const allowed =
    active !== null &&
    (can(active, "academic:manage-curriculum") ||
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
        permission: "academic:manage-curriculum",
        reason: "enrollment-write-denied",
      },
      before: null,
      entity: "enrollment",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-curriculum");
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

const requireEnrollmentApprover = async (action: string) => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (active && can(active, "academic:manage-curriculum")) {
    return { active, session };
  }
  const now = new Date();
  const delegations = await prisma.delegation.findMany({
    where: { toId: session.user.id },
  });
  const covering = delegations.find(
    (row) =>
      (row.scope === action || row.scope === "*") &&
      row.startAt <= now &&
      row.endAt >= now,
  );
  if (covering) {
    await logAudit({
      action: "approval-delegate",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: { action, delegationId: covering.id, scope: covering.scope },
      before: null,
      entity: "approval",
      entityId: null,
    });
    return { active, session };
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
      permission: "academic:manage-curriculum",
      reason: `${action}-approve-denied`,
    },
    before: null,
    entity: "approval",
    entityId: null,
  });
  throw new ForbiddenError("academic:manage-curriculum");
};

const countActiveInSection = async (
  sectionId: string,
  excludeEnrollmentId?: string,
): Promise<number> =>
  prisma.enrollment.count({
    where: {
      sectionId,
      status: { in: [...ACTIVE_STATUSES] },
      ...(excludeEnrollmentId ? { id: { not: excludeEnrollmentId } } : {}),
    },
  });

const validatePlacement = async (
  data: enrollmentType,
  excludeEnrollmentId?: string,
): Promise<{ errors: EnrollmentErrorMap; ok: false } | { ok: true }> => {
  const year = await prisma.academicYear.findUnique({
    where: { id: data.yearId },
  });
  if (!year) {
    return { errors: { yearId: "Pick a valid academic year." }, ok: false };
  }
  if (year.status === "CLOSED") {
    return {
      errors: { yearId: "This academic year is closed." },
      ok: false,
    };
  }
  const student = await prisma.studentProfile.findUnique({
    include: { class: true },
    where: { id: data.studentId },
  });
  if (!student) {
    return {
      errors: { studentId: "This student no longer exists." },
      ok: false,
    };
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
  if (!section) {
    return { errors: { sectionId: "Pick a valid section." }, ok: false };
  }
  if (section.yearId !== data.yearId || section.classId !== data.classId) {
    return {
      errors: { sectionId: "This section does not belong to the class year." },
      ok: false,
    };
  }
  const senior = isSeniorSecondaryOrder(schoolClass.order);
  const streamId = data.streamId?.trim() || null;
  if (senior) {
    if (!streamId) {
      return {
        errors: { streamId: "Pick a stream for Class 11 and 12." },
        ok: false,
      };
    }
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });
    if (!stream || stream.classId !== data.classId) {
      return {
        errors: { streamId: "This stream does not belong to the class." },
        ok: false,
      };
    }
  } else if (streamId) {
    return {
      errors: { streamId: "Streams apply to Class 11 and 12 only." },
      ok: false,
    };
  }
  const pickIds = [...new Set(data.subjectPickIds ?? [])];
  if (pickIds.length > 0) {
    const classSubjects = await prisma.classSubject.findMany({
      where: { classId: data.classId, subjectId: { in: pickIds } },
    });
    const optionalIds = new Set(
      classSubjects.filter((row) => row.isOptional).map((row) => row.subjectId),
    );
    const badClass = pickIds.find((id) => !optionalIds.has(id));
    if (badClass) {
      return {
        errors: {
          subjectPickIds:
            "Optional picks must be optional subjects of the class.",
        },
        ok: false,
      };
    }
    if (streamId) {
      const streamSubjects = await prisma.streamSubject.findMany({
        where: { streamId, subjectId: { in: pickIds } },
      });
      const allowed = new Set(streamSubjects.map((row) => row.subjectId));
      const badStream = pickIds.find((id) => !allowed.has(id));
      if (badStream) {
        return {
          errors: {
            subjectPickIds: "Optional picks must belong to the picked stream.",
          },
          ok: false,
        };
      }
    }
  }
  const activeCount = await countActiveInSection(
    data.sectionId,
    excludeEnrollmentId,
  );
  if (activeCount >= section.capacity) {
    return {
      errors: { sectionId: "This section is full." },
      ok: false,
    };
  }
  const duplicate = await prisma.enrollment.findFirst({
    select: { id: true },
    where: {
      sectionId: data.sectionId,
      rollNo: data.rollNo.trim(),
      ...(excludeEnrollmentId ? { id: { not: excludeEnrollmentId } } : {}),
    },
  });
  if (duplicate) {
    return {
      errors: { rollNo: "This roll number is already used in the section." },
      ok: false,
    };
  }
  return { ok: true };
};

export const suggestRollNo = async (
  sectionId: string,
): Promise<
  { ok: true; rollNo: string } | { ok: false; errors: { root: string } }
> => {
  await requireEnrollmentWrite();
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
  });
  if (!section) {
    return { errors: { root: "Pick a valid section." }, ok: false };
  }
  const rows = await prisma.enrollment.findMany({
    select: { rollNo: true },
    where: { sectionId },
  });
  const taken = new Set(rows.map((row) => row.rollNo));
  let candidate = rows.length + 1;
  while (taken.has(String(candidate))) {
    candidate += 1;
  }
  return { ok: true, rollNo: String(candidate) };
};

export const createEnrollment = async (
  input: enrollmentType,
): Promise<EnrollmentResult> => {
  const { actor } = await requireEnrollmentWrite();
  const parsed = enrollmentSchema.safeParse(input);
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
    rollNo: parsed.data.rollNo.trim(),
    streamId: parsed.data.streamId?.trim() || null,
  };
  const check = await validatePlacement(data);
  if (!check.ok) {
    return { errors: check.errors, ok: false };
  }
  const existingYear = await prisma.enrollment.findUnique({
    where: {
      studentId_yearId: { studentId: data.studentId, yearId: data.yearId },
    },
  });
  if (existingYear) {
    return {
      errors: { studentId: "This student is already enrolled for the year." },
      ok: false,
    };
  }
  try {
    const pickIds = [...new Set(data.subjectPickIds ?? [])];
    const row = await prisma.$transaction(async (tx) => {
      const section = await tx.section.findUnique({
        where: { id: data.sectionId },
      });
      if (!section) {
        throw new Error("This section no longer exists.");
      }
      const liveCount = await tx.enrollment.count({
        where: {
          sectionId: data.sectionId,
          status: { in: [...ACTIVE_STATUSES] },
        },
      });
      if (liveCount >= section.capacity) {
        throw new Error("This section is full.");
      }
      const liveDuplicate = await tx.enrollment.findFirst({
        select: { id: true },
        where: { rollNo: data.rollNo, sectionId: data.sectionId },
      });
      if (liveDuplicate) {
        const err = new Error("This roll number is already used.");
        (err as { code?: string }).code = "P2002";
        throw err;
      }
      const created = await tx.enrollment.create({
        data: {
          classId: data.classId,
          rollNo: data.rollNo,
          sectionId: data.sectionId,
          status: data.status,
          streamId: data.streamId,
          studentId: data.studentId,
          yearId: data.yearId,
        },
      });
      if (pickIds.length > 0) {
        await tx.enrollmentSubjectPick.createMany({
          data: pickIds.map((subjectId) => ({
            enrollmentId: created.id,
            subjectId,
          })),
        });
      }
      return created;
    });
    await logAudit({
      action: "create",
      actor,
      after: { ...toSafeEnrollment(row), picks: pickIds },
      before: null,
      entity: "enrollment",
      entityId: row.id,
    });
    return { enrollment: { id: row.id, rollNo: row.rollNo }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { rollNo: "This roll number is already used in the section." },
        ok: false,
      };
    }
    if (error instanceof Error) {
      if (error.message === "This section is full.") {
        return { errors: { sectionId: error.message }, ok: false };
      }
      if (error.message === "This roll number is already used.") {
        return {
          errors: {
            rollNo: "This roll number is already used in the section.",
          },
          ok: false,
        };
      }
      if (error.message === "This section no longer exists.") {
        return { errors: { sectionId: error.message }, ok: false };
      }
    }
    return {
      errors: { root: "Could not create this enrollment. Try again." },
      ok: false,
    };
  }
};

export const updateEnrollment = async (
  input: enrollmentType & { id: string },
): Promise<EnrollmentResult> => {
  const { actor } = await requireEnrollmentWrite();
  if (!input.id) {
    return { errors: { root: "Missing enrollment id." }, ok: false };
  }
  const parsed = enrollmentSchema.safeParse(input);
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
  const target = await prisma.enrollment.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This enrollment no longer exists." }, ok: false };
  }
  if (
    target.status === "TRANSFERRED" ||
    target.status === "WITHDRAWN" ||
    target.status === "GRADUATED"
  ) {
    return {
      errors: { root: "Terminal enrollments change through approval only." },
      ok: false,
    };
  }
  const data = {
    ...parsed.data,
    rollNo: parsed.data.rollNo.trim(),
    streamId: parsed.data.streamId?.trim() || null,
  };
  const check = await validatePlacement(data, target.id);
  if (!check.ok) {
    return { errors: check.errors, ok: false };
  }
  try {
    const before = toSafeEnrollment(target);
    const pickIds = [...new Set(data.subjectPickIds ?? [])];
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.enrollment.update({
        data: {
          classId: data.classId,
          rollNo: data.rollNo,
          sectionId: data.sectionId,
          status: data.status,
          streamId: data.streamId,
        },
        where: { id: target.id },
      });
      await tx.enrollmentSubjectPick.deleteMany({
        where: { enrollmentId: target.id },
      });
      if (pickIds.length > 0) {
        await tx.enrollmentSubjectPick.createMany({
          data: pickIds.map((subjectId) => ({
            enrollmentId: target.id,
            subjectId,
          })),
        });
      }
      return updated;
    });
    const minimal = toMinimalAuditChange(before, toSafeEnrollment(row));
    await logAudit({
      action: "update",
      actor,
      after: { ...minimal.after, picks: pickIds },
      before: minimal.before,
      entity: "enrollment",
      entityId: row.id,
    });
    return { enrollment: { id: row.id, rollNo: row.rollNo }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { rollNo: "This roll number is already used in the section." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not update this enrollment. Try again." },
      ok: false,
    };
  }
};

const parseTransferPayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const enrollmentId =
    typeof record.enrollmentId === "string" ? record.enrollmentId : null;
  const targetSectionId =
    typeof record.targetSectionId === "string" ? record.targetSectionId : null;
  const reason = typeof record.reason === "string" ? record.reason : null;
  if (!enrollmentId || !targetSectionId || !reason) return null;
  return { enrollmentId, reason, targetSectionId };
};

const parseWithdrawalPayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const enrollmentId =
    typeof record.enrollmentId === "string" ? record.enrollmentId : null;
  const reason = typeof record.reason === "string" ? record.reason : null;
  if (!enrollmentId || !reason) return null;
  return { enrollmentId, reason };
};

export const requestTransfer = async (input: {
  enrollmentId: string;
  reason: string;
  targetSectionId: string;
}): Promise<EnrollmentRequestResult> => {
  const { session } = await requireEnrollmentWrite();
  const parsed = transferRequestSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<
      Record<"enrollmentId" | "reason" | "root" | "targetSectionId", string>
    > = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "root") as keyof typeof errors;
      if (!errors[field]) errors[field] = issue.message;
    }
    return { errors, ok: false };
  }
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
  });
  if (!enrollment) {
    return {
      errors: { enrollmentId: "This enrollment no longer exists." },
      ok: false,
    };
  }
  const target = await prisma.section.findUnique({
    where: { id: parsed.data.targetSectionId },
  });
  if (!target) {
    return {
      errors: { targetSectionId: "Pick a valid target section." },
      ok: false,
    };
  }
  if (target.yearId !== enrollment.yearId) {
    return {
      errors: { targetSectionId: "Transfer stays within the same year." },
      ok: false,
    };
  }
  const activeCount = await countActiveInSection(target.id, enrollment.id);
  if (activeCount >= target.capacity) {
    return {
      errors: { targetSectionId: "The target section is full." },
      ok: false,
    };
  }
  const approvalId = await createApprovalRequest({
    action: "transfer",
    payload: {
      enrollmentId: enrollment.id,
      reason: parsed.data.reason.trim().slice(0, 500),
      targetSectionId: target.id,
    },
    requestedBy: session.user.id,
  });
  return { approvalId, ok: true };
};

export const requestWithdrawal = async (input: {
  enrollmentId: string;
  reason: string;
}): Promise<EnrollmentRequestResult> => {
  const { session } = await requireEnrollmentWrite();
  const parsed = withdrawalRequestSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<
      Record<"enrollmentId" | "reason" | "root" | "targetSectionId", string>
    > = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "root") as keyof typeof errors;
      if (!errors[field]) errors[field] = issue.message;
    }
    return { errors, ok: false };
  }
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
  });
  if (!enrollment) {
    return {
      errors: { enrollmentId: "This enrollment no longer exists." },
      ok: false,
    };
  }
  const approvalId = await createApprovalRequest({
    action: "withdrawal",
    payload: {
      enrollmentId: enrollment.id,
      reason: parsed.data.reason.trim().slice(0, 500),
    },
    requestedBy: session.user.id,
  });
  return { approvalId, ok: true };
};

const executeTransferCore = async (
  approvalId: string,
  actorId: string,
  db: typeof prisma = prisma,
) => {
  const approval = await db.approvalRequest.findUnique({
    where: { id: approvalId },
  });
  if (!approval || approval.action !== "transfer") {
    throw new Error("This transfer request no longer exists.");
  }
  const payload = parseTransferPayload(approval.payload);
  if (!payload) {
    throw new Error("This transfer payload is incomplete.");
  }
  const enrollment = await db.enrollment.findUnique({
    where: { id: payload.enrollmentId },
  });
  if (!enrollment) {
    throw new Error("This enrollment no longer exists.");
  }
  if (
    enrollment.status === "WITHDRAWN" ||
    enrollment.status === "GRADUATED" ||
    enrollment.status === "TRANSFERRED"
  ) {
    throw new Error("This enrollment is already closed.");
  }
  const target = await db.section.findUnique({
    where: { id: payload.targetSectionId },
  });
  if (!target) {
    throw new Error("The target section no longer exists.");
  }
  if (target.yearId !== enrollment.yearId) {
    throw new Error("Transfer stays within the same year. Resubmit.");
  }
  const year = await db.academicYear.findUnique({
    where: { id: enrollment.yearId },
  });
  if (!year || year.status === "CLOSED") {
    throw new Error("This academic year is closed.");
  }
  const activeCount = await countActiveInSection(target.id, enrollment.id);
  if (activeCount >= target.capacity) {
    throw new Error("The target section is now full. Resubmit.");
  }
  const duplicate = await db.enrollment.findFirst({
    where: {
      id: { not: enrollment.id },
      rollNo: enrollment.rollNo,
      sectionId: target.id,
    },
  });
  if (duplicate) {
    throw new Error("Roll number clashes in the target section. Resubmit.");
  }
  const before = toSafeEnrollment(enrollment);
  const row = await db.enrollment.update({
    data: {
      classId: target.classId,
      sectionId: target.id,
      status: "TRANSFERRED",
    },
    where: { id: enrollment.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeEnrollment(row));
  await logAudit(
    {
      action: "transfer-apply",
      actor: { id: actorId },
      after: { ...minimal.after, reason: payload.reason },
      before: minimal.before,
      entity: "enrollment",
      entityId: row.id,
    },
    { db },
  );
};

const executeWithdrawalCore = async (
  approvalId: string,
  actorId: string,
  db: typeof prisma = prisma,
) => {
  const approval = await db.approvalRequest.findUnique({
    where: { id: approvalId },
  });
  if (!approval || approval.action !== "withdrawal") {
    throw new Error("This withdrawal request no longer exists.");
  }
  const payload = parseWithdrawalPayload(approval.payload);
  if (!payload) {
    throw new Error("This withdrawal payload is incomplete.");
  }
  const enrollment = await db.enrollment.findUnique({
    where: { id: payload.enrollmentId },
  });
  if (!enrollment) {
    throw new Error("This enrollment no longer exists.");
  }
  if (enrollment.status === "WITHDRAWN" || enrollment.status === "GRADUATED") {
    throw new Error("This enrollment is already closed.");
  }
  const year = await db.academicYear.findUnique({
    where: { id: enrollment.yearId },
  });
  if (!year || year.status === "CLOSED") {
    throw new Error("This academic year is closed.");
  }
  const before = toSafeEnrollment(enrollment);
  const row = await db.enrollment.update({
    data: { status: "WITHDRAWN" },
    where: { id: enrollment.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeEnrollment(row));
  await logAudit(
    {
      action: "withdrawal-apply",
      actor: { id: actorId },
      after: { ...minimal.after, reason: payload.reason },
      before: minimal.before,
      entity: "enrollment",
      entityId: row.id,
    },
    { db },
  );
};

const decideFlow = async (
  action: "transfer" | "withdrawal",
  input: { decision: "APPROVE" | "REJECT"; id: string; reason?: string },
): Promise<EnrollmentDecideResult> => {
  const { session } = await requireEnrollmentApprover(action);
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: input.id },
  });
  if (!approval || approval.action !== action) {
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
    return { approvalId: fresh.id, ok: true, status: "REJECTED" };
  }
  if (fresh?.status === "APPROVED") {
    return { approvalId: fresh.id, ok: true, status: "APPROVED" };
  }
  if (outcome.kind === "DENY") {
    return { errors: { root: outcome.reason }, ok: false };
  }
  return { errors: { root: "Could not decide this request." }, ok: false };
};

const applyFlow = async (
  action: "transfer" | "withdrawal",
  approvalId: string,
): Promise<EnrollmentApplyResult> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
  });
  if (!approval || approval.action !== action) {
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
  const canManage = active && can(active, "academic:manage-curriculum");
  const canRetryFailed =
    approval.status === "FAILED" && active && can(active, "system:manage");
  if (!canManage && !canRetryFailed) {
    await logAudit({
      action: "permission-deny",
      actor,
      after: {
        active: active ?? null,
        blocked: true,
        permission: "academic:manage-curriculum",
        reason: `${action}-apply-denied`,
      },
      before: null,
      entity: "approval",
      entityId: approval.id,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (action === "transfer") {
        await executeTransferCore(approval.id, session.user.id, tx);
      } else {
        await executeWithdrawalCore(approval.id, session.user.id, tx);
      }
      await tx.approvalRequest.update({
        data: {
          appliedAt: new Date(),
          appliedBy: session.user.id,
          status: "APPLIED",
        },
        where: { id: approval.id },
      });
    });
    await logAudit({
      action: "approval-apply",
      actor,
      after: { action: approval.action, status: "APPLIED" },
      before: { action: approval.action, status: "APPROVED" },
      entity: "approval",
      entityId: approval.id,
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
      actor,
      after: { action: approval.action, status: "FAILED" },
      before: { action: approval.action, status: approval.status },
      entity: "approval",
      entityId: approval.id,
    });
    return { errors: { root: message }, ok: false };
  }
};

export const decideTransferApproval = async (input: {
  decision: "APPROVE" | "REJECT";
  id: string;
  reason?: string;
}): Promise<EnrollmentDecideResult> => decideFlow("transfer", input);

export const applyTransferApproval = async (input: {
  id: string;
}): Promise<EnrollmentApplyResult> => applyFlow("transfer", input.id);

export const decideWithdrawalApproval = async (input: {
  decision: "APPROVE" | "REJECT";
  id: string;
  reason?: string;
}): Promise<EnrollmentDecideResult> => decideFlow("withdrawal", input);

export const applyWithdrawalApproval = async (input: {
  id: string;
}): Promise<EnrollmentApplyResult> => applyFlow("withdrawal", input.id);
