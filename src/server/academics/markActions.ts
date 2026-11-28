"use server";

import { can } from "@/lib/auth/permissions";
import {
  marksEntrySchema,
  toMarksHundredths,
  type marksEntryType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit } from "@/server/audit";
import { decideApproval } from "@/server/admin/roleActions";
import { assertTeacherScope } from "@/server/academics/scopeHelpers";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

const ACTIVE_ENROLLMENT = ["ENROLLED", "PROMOTED", "REPEATED"] as const;

type ScopeEnrollment = {
  classId: string;
  picks: { subjectId: string }[];
  sectionId: string;
  status: string;
  streamId: string | null;
  studentId: string;
};

export const isStudentInPaperScope = async (input: {
  enrollment: ScopeEnrollment;
  examStreamId: string | null;
  paperClassId: string;
  paperClassOrder: number;
  subjectId: string;
}): Promise<boolean> => {
  if (input.enrollment.classId !== input.paperClassId) return false;
  if (input.examStreamId) {
    if (input.enrollment.streamId === input.examStreamId) return true;
    return input.enrollment.picks.some(
      (pick) => pick.subjectId === input.subjectId,
    );
  }
  if (input.paperClassOrder < 14) return true;
  const link = await prisma.classSubject.findUnique({
    where: {
      classId_subjectId: {
        classId: input.paperClassId,
        subjectId: input.subjectId,
      },
    },
  });
  if (link && !link.isOptional) return true;
  if (input.enrollment.streamId) {
    const mapping = await prisma.streamSubject.findUnique({
      where: {
        streamId_subjectId: {
          streamId: input.enrollment.streamId,
          subjectId: input.subjectId,
        },
      },
    });
    if (mapping) return true;
  }
  return input.enrollment.picks.some(
    (pick) => pick.subjectId === input.subjectId,
  );
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

const requireMarksManager = async () => {
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
      reason: "marks-write-denied",
    },
    before: null,
    entity: "mark",
    entityId: null,
  });
  throw new ForbiddenError("academic:manage-exams");
};

export type MarksSaveResult =
  { ok: true; saved: number } | { errors: Record<string, string>; ok: false };

export const saveMarksEntry = async (
  input: marksEntryType,
): Promise<MarksSaveResult> => {
  const parsed = marksEntrySchema.safeParse(input);
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
  const session = await requireSession();
  const { actor } = await requireMarksManager();
  const paper = await prisma.examPaper.findUnique({
    include: {
      components: true,
      exam: { include: { year: true } },
    },
    where: { id: parsed.data.paperId },
  });
  if (!paper) {
    return { errors: { root: "This paper no longer exists." }, ok: false };
  }
  if (paper.exam.year.status === "CLOSED") {
    return { errors: { root: "This academic year is closed." }, ok: false };
  }
  if (paper.exam.status === "LOCKED" || paper.exam.status === "FINALIZED") {
    return {
      errors: { root: "Locked or finalized exams cannot change marks." },
      ok: false,
    };
  }
  const studentIds = [...new Set(parsed.data.rows.map((row) => row.studentId))];
  if (studentIds.length !== parsed.data.rows.length) {
    return {
      errors: { root: "Each student may appear only once." },
      ok: false,
    };
  }
  const enrollments = await prisma.enrollment.findMany({
    select: {
      classId: true,
      picks: { select: { subjectId: true } },
      sectionId: true,
      status: true,
      streamId: true,
      studentId: true,
    },
    where: {
      classId: paper.classId,
      status: { in: [...ACTIVE_ENROLLMENT] },
      studentId: { in: studentIds },
      yearId: paper.exam.yearId,
    },
  });
  const byStudent = new Map(enrollments.map((row) => [row.studentId, row]));
  const paperClass = await prisma.schoolClass.findUnique({
    where: { id: paper.classId },
  });
  const paperOrder = paperClass?.order ?? 0;
  const componentByKind = new Map(
    paper.components.map((row) => [row.kind, row]),
  );
  const classLink =
    paperOrder >= 14 ?
      await prisma.classSubject.findUnique({
        select: { isOptional: true },
        where: {
          classId_subjectId: {
            classId: paper.classId,
            subjectId: paper.subjectId,
          },
        },
      })
    : null;
  const streamsWithSubject =
    paperOrder >= 14 && !paper.exam.streamId ?
      new Set(
        (
          await prisma.streamSubject.findMany({
            select: { streamId: true },
            where: { subjectId: paper.subjectId },
          })
        ).map((row) => row.streamId),
      )
    : new Set<string>();
  const { active } = await getFreshRoleContext(session.user.id);
  const canManageAll =
    active !== null && can(active, "academic:manage-curriculum");
  const staffProfile = await prisma.staffProfile.findFirst({
    select: { wardStudentId: true },
    where: { userId: session.user.id },
  });
  const wardSections =
    staffProfile?.wardStudentId ?
      new Set(
        (
          await prisma.enrollment.findMany({
            select: { sectionId: true },
            where: {
              classId: paper.classId,
              status: { in: [...ACTIVE_ENROLLMENT] },
              studentId: staffProfile.wardStudentId,
              yearId: paper.exam.yearId,
            },
          })
        ).map((row) => row.sectionId),
      )
    : new Set<string>();
  const teacherAssignments =
    canManageAll ?
      []
    : await prisma.teacherAssignment.findMany({
        select: { sectionId: true },
        where: {
          classId: paper.classId,
          isActive: true,
          subjectId: paper.subjectId,
          teacherId: session.user.id,
          yearId: paper.exam.yearId,
        },
      });
  const hasWholeClassAssignment = teacherAssignments.some(
    (row) => row.sectionId === null,
  );
  const assignedSections = new Set(
    teacherAssignments
      .map((row) => row.sectionId)
      .filter((value): value is string => value !== null),
  );
  const isInScope = (enrollment: ScopeEnrollment): boolean => {
    if (enrollment.classId !== paper.classId) return false;
    if (paper.exam.streamId) {
      if (enrollment.streamId === paper.exam.streamId) return true;
      return enrollment.picks.some(
        (pick) => pick.subjectId === paper.subjectId,
      );
    }
    if (paperOrder < 14) return true;
    if (classLink && !classLink.isOptional) return true;
    if (enrollment.streamId && streamsWithSubject.has(enrollment.streamId))
      return true;
    return enrollment.picks.some((pick) => pick.subjectId === paper.subjectId);
  };
  const existing = await prisma.mark.findMany({
    where: { paperId: paper.id, studentId: { in: studentIds } },
  });
  const locked = existing.filter((row) => row.status !== "DRAFT");
  if (locked.length > 0) {
    return {
      errors: {
        root: `${locked.length} row(s) are already submitted or approved and need a reopen approval to change.`,
      },
      ok: false,
    };
  }
  const prepared: {
    internalHundredths: number | null;
    practicalHundredths: number | null;
    state: "SCORED" | "ABSENT" | "EXEMPT";
    studentId: string;
    theoryHundredths: number | null;
    totalHundredths: number | null;
  }[] = [];
  for (const row of parsed.data.rows) {
    const enrollment = byStudent.get(row.studentId);
    if (!enrollment) {
      return {
        errors: {
          root: "One or more students are not enrolled in this class plus year.",
        },
        ok: false,
      };
    }
    if (!isInScope(enrollment)) {
      return {
        errors: {
          root: "One or more students are outside this paper stream plus picks scope.",
        },
        ok: false,
      };
    }
    if (wardSections.has(enrollment.sectionId)) {
      const actorRow = await prisma.user.findUnique({
        select: { email: true, id: true, role: true },
        where: { id: session.user.id },
      });
      await logAudit({
        action: "permission-deny",
        actor: {
          email: actorRow?.email ?? null,
          id: session.user.id,
          role: actorRow?.role ?? null,
        },
        after: {
          active: active ?? null,
          blocked: true,
          classId: paper.classId,
          reason: "ward-conflict-whole-class",
          sectionId: enrollment.sectionId,
        },
        before: null,
        entity: "permission",
        entityId: session.user.id,
      });
      return {
        errors: { root: "Denied by teaching scope. This attempt was logged." },
        ok: false,
      };
    }
    if (
      !canManageAll &&
      !hasWholeClassAssignment &&
      !assignedSections.has(enrollment.sectionId)
    ) {
      const actorRow = await prisma.user.findUnique({
        select: { email: true, id: true, role: true },
        where: { id: session.user.id },
      });
      await logAudit({
        action: "permission-deny",
        actor: {
          email: actorRow?.email ?? null,
          id: session.user.id,
          role: actorRow?.role ?? null,
        },
        after: {
          active: active ?? null,
          blocked: true,
          classId: paper.classId,
          reason: "teacher-assignment-denied",
          sectionId: enrollment.sectionId,
          subjectId: paper.subjectId,
        },
        before: null,
        entity: "permission",
        entityId: session.user.id,
      });
      return {
        errors: { root: "Denied by teaching scope. This attempt was logged." },
        ok: false,
      };
    }
    if (row.state !== "SCORED") {
      prepared.push({
        internalHundredths: null,
        practicalHundredths: null,
        state: row.state,
        studentId: row.studentId,
        theoryHundredths: null,
        totalHundredths: null,
      });
      continue;
    }
    if (componentByKind.size > 0) {
      const getValue = (kind: string): number | null => {
        if (kind === "THEORY") return row.theoryMarks ?? null;
        if (kind === "PRACTICAL") return row.practicalMarks ?? null;
        return row.internalMarks ?? null;
      };
      let total = 0;
      const scored: Record<string, number | null> = {
        INTERNAL: null,
        PRACTICAL: null,
        THEORY: null,
      };
      for (const [kind, component] of componentByKind) {
        const value = getValue(kind);
        if (value === null || !Number.isFinite(value)) {
          return {
            errors: {
              root: `Enter ${kind.toLowerCase()} marks for every scored row.`,
            },
            ok: false,
          };
        }
        const hundredths = toMarksHundredths(value);
        if (hundredths < 0 || hundredths > component.maxHundredths) {
          return {
            errors: {
              root: `${kind} marks must sit within 0 and the component max.`,
            },
            ok: false,
          };
        }
        scored[kind] = hundredths;
        total += hundredths;
      }
      prepared.push({
        internalHundredths: scored["INTERNAL"],
        practicalHundredths: scored["PRACTICAL"],
        state: "SCORED",
        studentId: row.studentId,
        theoryHundredths: scored["THEORY"],
        totalHundredths: total,
      });
    } else {
      if (row.totalMarks === null || row.totalMarks === undefined) {
        return {
          errors: { root: "Enter total marks for every scored row." },
          ok: false,
        };
      }
      const total = toMarksHundredths(row.totalMarks);
      if (total < 0 || total > paper.maxHundredths) {
        return {
          errors: { root: "Total marks must sit within 0 and the paper max." },
          ok: false,
        };
      }
      prepared.push({
        internalHundredths: null,
        practicalHundredths: null,
        state: "SCORED",
        studentId: row.studentId,
        theoryHundredths: null,
        totalHundredths: total,
      });
    }
  }
  await prisma.$transaction(
    prepared.map((row) =>
      prisma.mark.upsert({
        create: {
          enteredBy: session.user.id,
          internalHundredths: row.internalHundredths,
          paperId: paper.id,
          practicalHundredths: row.practicalHundredths,
          state: row.state as never,
          status: "DRAFT",
          studentId: row.studentId,
          theoryHundredths: row.theoryHundredths,
          totalHundredths: row.totalHundredths,
        },
        update: {
          enteredBy: session.user.id,
          internalHundredths: row.internalHundredths,
          practicalHundredths: row.practicalHundredths,
          state: row.state as never,
          theoryHundredths: row.theoryHundredths,
          totalHundredths: row.totalHundredths,
        },
        where: {
          paperId_studentId: { paperId: paper.id, studentId: row.studentId },
        },
      }),
    ),
  );
  await logAudit({
    action: "marks-entry",
    actor,
    after: { paperId: paper.id, saved: prepared.length },
    before: null,
    entity: "mark",
    entityId: paper.id,
  });
  return { ok: true, saved: prepared.length };
};

const parsePaperPayload = (payload: unknown): { paperId: string } | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const paperId = record["paperId"];
  if (typeof paperId !== "string" || paperId.trim() === "") return null;
  return { paperId };
};

const revalidatePaperForApply = async (
  paperId: string,
): Promise<
  | {
      ok: true;
      paper: {
        examStatus: string;
        id: string;
        yearStatus: string;
      };
    }
  | { errors: Record<string, string>; ok: false }
> => {
  const paper = await prisma.examPaper.findUnique({
    include: { exam: { include: { year: true } } },
    where: { id: paperId },
  });
  if (!paper) {
    return { errors: { root: "This paper no longer exists." }, ok: false };
  }
  if (paper.exam.year.status === "CLOSED") {
    return { errors: { root: "This academic year is closed." }, ok: false };
  }
  return {
    ok: true,
    paper: {
      examStatus: paper.exam.status,
      id: paper.id,
      yearStatus: paper.exam.year.status,
    },
  };
};

export type MarksApprovalResult =
  | { approvalId: string; ok: true }
  | { errors: Record<string, string>; ok: false };

export const requestMarksSubmit = async (input: {
  paperId: string;
}): Promise<MarksApprovalResult> => {
  const session = await requireSession();
  await requireMarksManager();
  const paper = await prisma.examPaper.findUnique({
    include: { exam: { include: { year: true } }, marks: true },
    where: { id: input.paperId },
  });
  if (!paper) {
    return { errors: { root: "This paper no longer exists." }, ok: false };
  }
  if (paper.exam.year.status === "CLOSED") {
    return { errors: { root: "This academic year is closed." }, ok: false };
  }
  if (paper.exam.status === "LOCKED" || paper.exam.status === "FINALIZED") {
    return {
      errors: { root: "Locked or finalized exams cannot change marks." },
      ok: false,
    };
  }
  const drafts = paper.marks.filter((row) => row.status === "DRAFT");
  if (drafts.length === 0) {
    return {
      errors: { root: "No draft marks left to submit." },
      ok: false,
    };
  }
  const draftStudentIds = [...new Set(drafts.map((row) => row.studentId))];
  const draftEnrollments = await prisma.enrollment.findMany({
    select: { sectionId: true, studentId: true },
    where: {
      classId: paper.classId,
      status: { in: [...ACTIVE_ENROLLMENT] },
      studentId: { in: draftStudentIds },
      yearId: paper.exam.yearId,
    },
  });
  if (draftEnrollments.length === 0) {
    return {
      errors: { root: "No enrolled students left to submit." },
      ok: false,
    };
  }
  const distinctSections = [
    ...new Set(draftEnrollments.map((row) => row.sectionId)),
  ];
  try {
    for (const sectionId of distinctSections) {
      await assertTeacherScope({
        classId: paper.classId,
        sectionId,
        subjectId: paper.subjectId,
        userId: session.user.id,
        yearId: paper.exam.yearId,
      });
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return {
        errors: { root: "Denied by teaching scope. This attempt was logged." },
        ok: false,
      };
    }
    throw error;
  }
  await prisma.mark.updateMany({
    data: { status: "SUBMITTED" },
    where: { paperId: paper.id, status: "DRAFT" },
  });
  const row = await prisma.approvalRequest.create({
    data: {
      action: "marks_submit",
      payload: { paperId: paper.id },
      requestedBy: session.user.id,
      status: "PENDING",
    },
  });
  await logAudit({
    action: "approval-request",
    actor: { email: session.user.email, id: session.user.id },
    after: { action: "marks_submit", paperId: paper.id, status: "PENDING" },
    before: null,
    entity: "approval",
    entityId: row.id,
  });
  return { approvalId: row.id, ok: true };
};

export const decideMarksApproval = async (input: {
  action: "marks_submit" | "marks_reopen";
  decision: "APPROVE" | "REJECT";
  id: string;
  reason?: string;
}): Promise<
  | { approvalId: string; ok: true; status: "APPROVED" | "REJECTED" }
  | { errors: Record<string, string>; ok: false }
> => {
  const { session } = await requireMarksManager();
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: input.id },
  });
  if (!approval || approval.action !== input.action) {
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

export type MarksApplyResult =
  { ok: true } | { errors: Record<string, string>; ok: false };

export const applyMarksApproval = async (input: {
  action: "marks_submit" | "marks_reopen";
  id: string;
}): Promise<MarksApplyResult> => {
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
  if (!approval || approval.action !== input.action) {
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
  const canManage = active && can(active, "academic:manage-exams");
  const canRetryFailed =
    approval.status === "FAILED" && active && can(active, "system:manage");
  if (!canManage && !canRetryFailed) {
    await logAudit({
      action: "permission-deny",
      actor,
      after: {
        active: active ?? null,
        blocked: true,
        permission: "academic:manage-exams",
        reason: "marks-apply-denied",
      },
      before: null,
      entity: "approval",
      entityId: approval.id,
    });
    throw new ForbiddenError("academic:manage-exams");
  }
  const payload = parsePaperPayload(approval.payload);
  if (!payload) {
    return {
      errors: { root: "This approval payload is incomplete." },
      ok: false,
    };
  }
  try {
    const fresh = await revalidatePaperForApply(payload.paperId);
    if (!fresh.ok) return fresh;
    if (input.action === "marks_submit") {
      const pending = await prisma.mark.count({
        where: { paperId: payload.paperId, status: "SUBMITTED" },
      });
      if (pending === 0) {
        throw new Error("No submitted marks left to approve.");
      }
      await prisma.mark.updateMany({
        data: { approvedBy: session.user.id, status: "APPROVED" },
        where: { paperId: payload.paperId, status: "SUBMITTED" },
      });
    } else {
      const locked = await prisma.mark.count({
        where: {
          paperId: payload.paperId,
          status: { in: ["SUBMITTED", "APPROVED"] },
        },
      });
      if (locked === 0) {
        throw new Error("No locked marks left to reopen.");
      }
      await prisma.mark.updateMany({
        data: { approvedBy: null, status: "DRAFT" },
        where: {
          paperId: payload.paperId,
          status: { in: ["SUBMITTED", "APPROVED"] },
        },
      });
    }
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

export const requestMarksReopen = async (input: {
  paperId: string;
  reason: string;
}): Promise<MarksApprovalResult> => {
  const session = await requireSession();
  await requireMarksManager();
  const reason = input.reason.trim();
  if (reason === "" || reason.length > 500) {
    return {
      errors: { reason: "Enter a reason up to 500 characters." },
      ok: false,
    };
  }
  const paper = await prisma.examPaper.findUnique({
    include: { exam: { include: { year: true } } },
    where: { id: input.paperId },
  });
  if (!paper) {
    return { errors: { root: "This paper no longer exists." }, ok: false };
  }
  if (paper.exam.year.status === "CLOSED") {
    return { errors: { root: "This academic year is closed." }, ok: false };
  }
  const locked = await prisma.mark.count({
    where: {
      paperId: paper.id,
      status: { in: ["SUBMITTED", "APPROVED"] },
    },
  });
  if (locked === 0) {
    return {
      errors: { root: "No locked marks need reopening." },
      ok: false,
    };
  }
  const row = await prisma.approvalRequest.create({
    data: {
      action: "marks_reopen",
      payload: { paperId: paper.id, reason },
      requestedBy: session.user.id,
      status: "PENDING",
    },
  });
  await logAudit({
    action: "approval-request",
    actor: { email: session.user.email, id: session.user.id },
    after: { action: "marks_reopen", paperId: paper.id, status: "PENDING" },
    before: null,
    entity: "approval",
    entityId: row.id,
  });
  return { approvalId: row.id, ok: true };
};
