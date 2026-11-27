"use server";

import prisma from "@/lib/dbClient/prisma";
import { can } from "@/lib/auth/permissions";
import {
  approvalDecisionSchema,
  isEligibleForStudentLogin,
  type approvalDecisionType,
} from "@/lib/zodSchema";
import { logAudit } from "@/server/audit";
import { decideApproval } from "@/server/admin/roleActions";
import {
  provisionParentInvite,
  provisionStudentLogin,
} from "@/server/academics/admissionActions";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

type AdmissionPayload = {
  admissionNo: string;
  classId: string;
  duplicateContact: boolean;
  guardianId: string;
  studentId: string;
  wardFlag: boolean;
  wardStaffId: string | null;
  yearId: string;
};

type DecideResult =
  | { approvalId: string; ok: true; status: "APPROVED" | "REJECTED" }
  | {
      errors: Partial<Record<"id" | "decision" | "reason" | "root", string>>;
      ok: false;
    };

type ApplyResult =
  | {
      invite: {
        admissionNo: string;
        classOrder: number;
        eligible: boolean;
        parentEmail: string | null;
        parentUserId: string | null;
        studentCreated: boolean;
        studentEmail: string | null;
        studentId: string;
        studentUserId: string | null;
        studentUsername: string | null;
      };
      ok: true;
    }
  | { errors: Partial<Record<"id" | "root", string>>; ok: false };

const toText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const toFlag = (value: unknown): boolean => value === true;

const parseAdmissionPayload = (payload: unknown): AdmissionPayload | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const studentId = toText(record.studentId);
  const guardianId = toText(record.guardianId);
  const classId = toText(record.classId);
  const yearId = toText(record.yearId);
  const admissionNo = toText(record.admissionNo);
  if (!studentId || !guardianId || !classId || !yearId || !admissionNo) {
    return null;
  }
  const wardStaffId = toText(record.wardStaffId);
  return {
    admissionNo,
    classId,
    duplicateContact: toFlag(record.duplicateContact),
    guardianId,
    studentId,
    wardFlag: toFlag(record.wardFlag),
    wardStaffId,
    yearId,
  };
};

const toRedactedAdmissionPayload = (payload: unknown) => {
  const parsed = parseAdmissionPayload(payload);
  if (!parsed) return {};
  return {
    admissionNo: parsed.admissionNo,
    classId: parsed.classId,
    duplicateContact: parsed.duplicateContact,
    guardianId: parsed.guardianId,
    studentId: parsed.studentId,
    wardFlag: parsed.wardFlag,
    yearId: parsed.yearId,
  };
};

const requireAdmissionApprover = async () => {
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
      (row.scope === "admission" || row.scope === "*") &&
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
      after: {
        action: "admission",
        delegationId: covering.id,
        scope: covering.scope,
      },
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
      reason: "admission-approve-denied",
    },
    before: null,
    entity: "approval",
    entityId: null,
  });
  throw new ForbiddenError("academic:manage-curriculum");
};

const executeAdmissionCore = async (approvalId: string, actorId: string) => {
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
  });
  if (!approval || approval.action !== "admission") {
    throw new Error("This admission request no longer exists.");
  }
  const payload = parseAdmissionPayload(approval.payload);
  if (!payload) {
    throw new Error("This admission payload is incomplete.");
  }
  const student = await prisma.studentProfile.findUnique({
    include: { class: true, year: true },
    where: { id: payload.studentId },
  });
  if (!student) {
    throw new Error("This student no longer exists.");
  }
  if (student.admissionNo !== payload.admissionNo) {
    throw new Error("Admission number mismatch. Resubmit with fresh data.");
  }
  if (
    student.classId !== payload.classId ||
    student.yearId !== payload.yearId
  ) {
    throw new Error("Class or year changed. Resubmit with fresh data.");
  }
  if (student.admissionStatus === "INACTIVE") {
    throw new Error("This admission is no longer active.");
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: payload.classId },
  });
  if (!schoolClass) {
    throw new Error("This class no longer exists.");
  }
  if (!schoolClass.isActive) {
    throw new Error("This class is not active.");
  }
  const year = await prisma.academicYear.findUnique({
    where: { id: payload.yearId },
  });
  if (!year) {
    throw new Error("This academic year no longer exists.");
  }
  if (year.status === "CLOSED") {
    throw new Error("This academic year is closed.");
  }
  const guardian = await prisma.guardian.findUnique({
    where: { id: payload.guardianId },
  });
  if (!guardian) {
    throw new Error("This guardian no longer exists.");
  }
  const eligible = isEligibleForStudentLogin(student.class.order);
  const studentLogin = await provisionStudentLogin(student.id, actorId);
  const parentInvite = await provisionParentInvite(guardian.id, actorId);
  if (student.admissionStatus === "PENDING") {
    const updated = await prisma.studentProfile.update({
      data: { admissionStatus: "ACTIVE" },
      where: { id: student.id },
    });
    await logAudit({
      action: "admission-approve",
      actor: { id: actorId },
      after: {
        admissionNo: updated.admissionNo,
        status: updated.admissionStatus,
        studentId: updated.id,
      },
      before: { status: "PENDING", studentId: student.id },
      entity: "student-profile",
      entityId: student.id,
    });
  }
  return {
    admissionNo: student.admissionNo,
    classOrder: student.class.order,
    eligible,
    parentEmail: guardian.email,
    parentUserId: parentInvite.userId,
    studentCreated: studentLogin.created,
    studentEmail: studentLogin.email,
    studentId: student.id,
    studentUserId: studentLogin.userId,
    studentUsername: studentLogin.username,
  };
};

export const decideAdmissionApproval = async (
  input: approvalDecisionType,
): Promise<DecideResult> => {
  const { session } = await requireAdmissionApprover();
  const parsed = approvalDecisionSchema.safeParse(input);
  if (!parsed.success) {
    // invalid decision payload
    return { errors: { root: "Pick a valid decision." }, ok: false };
  }
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: parsed.data.id },
  });
  if (!approval || approval.action !== "admission") {
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
    decision: parsed.data.decision,
    reason: parsed.data.reason,
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

export const applyAdmissionApproval = async (input: {
  id: string;
}): Promise<ApplyResult> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: input.id },
  });
  if (!approval || approval.action !== "admission") {
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
        reason: "admission-apply-denied",
      },
      before: null,
      entity: "approval",
      entityId: approval.id,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  if (canRetryFailed && !canManage) {
    await logAudit({
      action: "approval-retry",
      actor,
      after: {
        ...toRedactedAdmissionPayload(approval.payload),
        status: approval.status,
      },
      before: null,
      entity: "approval",
      entityId: approval.id,
    });
  }
  try {
    const invite = await executeAdmissionCore(approval.id, session.user.id);
    await prisma.approvalRequest.update({
      data: {
        appliedAt: new Date(),
        appliedBy: session.user.id,
        status: "APPLIED",
      },
      where: { id: approval.id },
    });
    await logAudit({
      action: "approval-apply",
      actor,
      after: {
        action: approval.action,
        admissionNo: invite.admissionNo,
        eligible: invite.eligible,
        status: "APPLIED",
        studentCreated: invite.studentCreated,
      },
      before: { action: approval.action, status: "APPROVED" },
      entity: "approval",
      entityId: approval.id,
    });
    return { invite, ok: true };
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
