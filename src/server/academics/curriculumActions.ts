"use server";

import { can, parseRoleNames } from "@/lib/auth/permissions";
import {
  curriculumLockedEditRequestSchema,
  curriculumMinimumSchema,
  curriculumReorderSchema,
  curriculumUnitSchema,
  isLockedClassOrder,
  MAX_CURRICULUM_MINIMUM,
  MIN_CURRICULUM_MINIMUM,
  SYSTEM_CURRICULUM_FLOOR,
  type curriculumLockedEditRequestType,
  type curriculumMinimumType,
  type curriculumReorderType,
  type curriculumUnitType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import { decideApproval } from "@/server/admin/roleActions";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

const toSafeUnit = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  return {
    classId: record["classId"] ?? null,
    objectives: record["objectives"] ?? null,
    order: record["order"] ?? null,
    source: record["source"] ?? null,
    streamId: record["streamId"] ?? null,
    subjectId: record["subjectId"] ?? null,
    title: record["title"] ?? null,
    yearId: record["yearId"] ?? null,
  };
};

const toSafeMinimum = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  return {
    classId: record["classId"] ?? null,
    minUnits: record["minUnits"] ?? null,
    subjectId: record["subjectId"] ?? null,
    yearId: record["yearId"] ?? null,
  };
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

const sourceForOrder = (order: number): "SCHOOL_DEFINED" | "CBSE_LOCKED" =>
  isLockedClassOrder(order) ? "CBSE_LOCKED" : "SCHOOL_DEFINED";

const normalizeTitle = (value: string): string => value.trim();

const requirePrincipalWriter = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (active && can(active, "academic:manage-curriculum")) {
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
      permission: "academic:manage-curriculum",
      reason: "curriculum-write-denied",
    },
    before: null,
    entity: "curriculum-unit",
    entityId: null,
  });
  throw new ForbiddenError("academic:manage-curriculum");
};

const requireLockedRequester = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  const allowed =
    (active && can(active, "academic:manage-curriculum")) ||
    active === "vice_principal" ||
    active === "teacher";
  if (allowed) {
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
      reason: "curriculum-request-denied",
    },
    before: null,
    entity: "approval",
    entityId: null,
  });
  throw new ForbiddenError("curriculum-request");
};

const validatePlacement = async (
  data: curriculumUnitType,
  excludeUnitId?: string,
): Promise<
  | {
      classOrder: number;
      ok: true;
      source: "SCHOOL_DEFINED" | "CBSE_LOCKED";
      streamId: string | null;
    }
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
  const streamId = (data.streamId ?? "").trim() || null;
  if (schoolClass.order < 14 && streamId) {
    return {
      errors: { streamId: "Streams exist only for Class 11 and 12." },
      ok: false,
    };
  }
  if (streamId) {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });
    if (!stream || stream.classId !== data.classId) {
      return { errors: { streamId: "Pick a valid stream." }, ok: false };
    }
    const mapping = await prisma.streamSubject.findUnique({
      where: {
        streamId_subjectId: { streamId, subjectId: data.subjectId },
      },
    });
    if (!mapping) {
      return {
        errors: { subjectId: "This subject is not mapped to the stream." },
        ok: false,
      };
    }
  }
  const title = normalizeTitle(data.title);
  if (title === "" || title.length > 120) {
    return {
      errors: { title: "Enter a title up to 120 characters." },
      ok: false,
    };
  }
  const siblings = await prisma.curriculumUnit.findMany({
    select: { id: true, streamId: true, title: true },
    where: {
      classId: data.classId,
      subjectId: data.subjectId,
      yearId: data.yearId,
      ...(excludeUnitId ? { id: { not: excludeUnitId } } : {}),
    },
  });
  const clash = siblings.find(
    (row) =>
      (row.streamId ?? null) === streamId &&
      row.title.trim().toLowerCase() === title.toLowerCase(),
  );
  if (clash) {
    return {
      errors: { title: "This title already exists in this scope." },
      ok: false,
    };
  }
  return {
    classOrder: schoolClass.order,
    ok: true,
    source: sourceForOrder(schoolClass.order),
    streamId,
  };
};

const getRequiredCount = async (input: {
  classId: string;
  subjectId: string;
  yearId: string;
}): Promise<number> => {
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: input.classId },
  });
  if (!schoolClass) return SYSTEM_CURRICULUM_FLOOR;
  if (isLockedClassOrder(schoolClass.order)) return SYSTEM_CURRICULUM_FLOOR;
  const minimum = await prisma.curriculumMinimum.findUnique({
    where: {
      yearId_classId_subjectId: {
        classId: input.classId,
        subjectId: input.subjectId,
        yearId: input.yearId,
      },
    },
  });
  return Math.max(SYSTEM_CURRICULUM_FLOOR, minimum?.minUnits ?? 0);
};

export type CurriculumUnitResult =
  | { ok: true; unit: { id: string } }
  | { errors: Record<string, string>; ok: false };

export const createCurriculumUnit = async (
  input: curriculumUnitType,
): Promise<CurriculumUnitResult> => {
  const parsed = curriculumUnitSchema.safeParse(input);
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
  const { actor } = await requirePrincipalWriter();
  if (placement.source === "CBSE_LOCKED") {
    await logAudit({
      action: "curriculum-locked-deny",
      actor,
      after: {
        blocked: true,
        classId: data.classId,
        reason: "locked-direct-blocked",
        subjectId: data.subjectId,
        yearId: data.yearId,
      },
      before: null,
      entity: "curriculum-unit",
      entityId: null,
    });
    return {
      errors: {
        root: "Class 9 to 12 units are locked. Request a locked edit for approval.",
      },
      ok: false,
    };
  }
  try {
    const siblings = await prisma.curriculumUnit.findMany({
      select: { order: true },
      where: {
        classId: data.classId,
        subjectId: data.subjectId,
        streamId: placement.streamId,
        yearId: data.yearId,
      },
    });
    const nextOrder =
      data.order ??
      (siblings.length > 0 ?
        Math.max(...siblings.map((row) => row.order)) + 1
      : 1);
    const row = await prisma.curriculumUnit.create({
      data: {
        classId: data.classId,
        objectives: (data.objectives ?? "").trim() || null,
        order: nextOrder,
        source: placement.source,
        streamId: placement.streamId,
        subjectId: data.subjectId,
        title: normalizeTitle(data.title),
        yearId: data.yearId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeUnit(row),
      before: null,
      entity: "curriculum-unit",
      entityId: row.id,
    });
    return { ok: true, unit: { id: row.id } };
  } catch {
    // No database unique on title scope (SQLite treats null streamId as
    // distinct), so duplicates are guarded by validatePlacement above.
    return {
      errors: { root: "Could not create this unit. Try again." },
      ok: false,
    };
  }
};

export const updateCurriculumUnit = async (
  input: curriculumUnitType & { id: string },
): Promise<CurriculumUnitResult> => {
  if (!input.id) {
    return { errors: { root: "Missing unit id." }, ok: false };
  }
  const parsed = curriculumUnitSchema.safeParse(input);
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
  const target = await prisma.curriculumUnit.findUnique({
    include: { class: true },
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This unit no longer exists." }, ok: false };
  }
  if (target.source === "CBSE_LOCKED") {
    const { actor } = await requirePrincipalWriter();
    await logAudit({
      action: "curriculum-locked-deny",
      actor,
      after: {
        blocked: true,
        reason: "locked-direct-blocked",
        unitId: target.id,
      },
      before: toSafeUnit(target),
      entity: "curriculum-unit",
      entityId: target.id,
    });
    return {
      errors: {
        root: "This locked unit needs a locked edit approval.",
      },
      ok: false,
    };
  }
  const data = parsed.data;
  const placement = await validatePlacement(data, target.id);
  if (!placement.ok) return placement;
  if (placement.source === "CBSE_LOCKED") {
    const { actor } = await requirePrincipalWriter();
    await logAudit({
      action: "curriculum-locked-deny",
      actor,
      after: {
        blocked: true,
        reason: "locked-target-blocked",
        unitId: target.id,
      },
      before: toSafeUnit(target),
      entity: "curriculum-unit",
      entityId: target.id,
    });
    return {
      errors: {
        root: "Moving into a locked class needs a locked edit approval.",
      },
      ok: false,
    };
  }
  const { actor } = await requirePrincipalWriter();
  const scopeChanged =
    target.yearId !== data.yearId ||
    target.classId !== data.classId ||
    (target.streamId ?? null) !== placement.streamId ||
    target.subjectId !== data.subjectId;
  let nextOrder = target.order;
  if (scopeChanged) {
    if (data.order) {
      nextOrder = data.order;
    } else {
      const siblings = await prisma.curriculumUnit.findMany({
        select: { order: true },
        where: {
          classId: data.classId,
          subjectId: data.subjectId,
          streamId: placement.streamId,
          yearId: data.yearId,
        },
      });
      nextOrder =
        siblings.length > 0 ?
          Math.max(...siblings.map((row) => row.order)) + 1
        : 1;
    }
  } else if (data.order) {
    nextOrder = data.order;
  }
  const before = toSafeUnit(target);
  const row = await prisma.curriculumUnit.update({
    data: {
      classId: data.classId,
      objectives: (data.objectives ?? "").trim() || null,
      order: nextOrder,
      source: placement.source,
      streamId: placement.streamId,
      subjectId: data.subjectId,
      title: normalizeTitle(data.title),
      yearId: data.yearId,
    },
    where: { id: target.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeUnit(row));
  await logAudit({
    action: "update",
    actor,
    after: minimal.after,
    before: minimal.before,
    entity: "curriculum-unit",
    entityId: row.id,
  });
  return { ok: true, unit: { id: row.id } };
};

export type CurriculumReorderResult =
  { ok: true } | { errors: Record<string, string>; ok: false };

export const reorderCurriculumUnits = async (
  input: curriculumReorderType,
): Promise<CurriculumReorderResult> => {
  const parsed = curriculumReorderSchema.safeParse(input);
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
  const { actor } = await requirePrincipalWriter();
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: data.classId },
  });
  if (!schoolClass) {
    return { errors: { classId: "Pick a valid class." }, ok: false };
  }
  if (isLockedClassOrder(schoolClass.order)) {
    await logAudit({
      action: "curriculum-locked-deny",
      actor,
      after: {
        blocked: true,
        classId: data.classId,
        reason: "locked-reorder-blocked",
        subjectId: data.subjectId,
      },
      before: null,
      entity: "curriculum-unit",
      entityId: null,
    });
    return {
      errors: {
        root: "Locked class order needs a locked edit approval.",
      },
      ok: false,
    };
  }
  const streamId = (data.streamId ?? "").trim() || null;
  const units = await prisma.curriculumUnit.findMany({
    where: {
      classId: data.classId,
      subjectId: data.subjectId,
      yearId: data.yearId,
    },
  });
  const scoped = units.filter((row) => (row.streamId ?? null) === streamId);
  const scopedIds = new Set(scoped.map((row) => row.id));
  if (
    data.unitIds.length !== scoped.length ||
    !data.unitIds.every((id) => scopedIds.has(id))
  ) {
    return {
      errors: { root: "Order list must match every unit in this scope." },
      ok: false,
    };
  }
  await prisma.$transaction(
    data.unitIds.map((id, index) =>
      prisma.curriculumUnit.update({
        data: { order: index + 1 },
        where: { id },
      }),
    ),
  );
  await logAudit({
    action: "reorder",
    actor,
    after: {
      classId: data.classId,
      streamId,
      subjectId: data.subjectId,
      unitIds: data.unitIds,
      yearId: data.yearId,
    },
    before: null,
    entity: "curriculum-unit",
    entityId: null,
  });
  return { ok: true };
};

export const moveCurriculumUnit = async (input: {
  direction: "up" | "down";
  id: string;
}): Promise<CurriculumReorderResult> => {
  if (!input.id) {
    return { errors: { root: "Missing unit id." }, ok: false };
  }
  if (input.direction !== "up" && input.direction !== "down") {
    return { errors: { root: "Pick a valid direction." }, ok: false };
  }
  const { actor } = await requirePrincipalWriter();
  const target = await prisma.curriculumUnit.findUnique({
    include: { class: true },
    where: { id: input.id },
  });
  if (!target) {
    return { errors: { root: "This unit no longer exists." }, ok: false };
  }
  if (target.source === "CBSE_LOCKED") {
    await logAudit({
      action: "curriculum-locked-deny",
      actor,
      after: {
        blocked: true,
        reason: "locked-move-blocked",
        unitId: target.id,
      },
      before: toSafeUnit(target),
      entity: "curriculum-unit",
      entityId: target.id,
    });
    return {
      errors: { root: "Locked class order needs a locked edit approval." },
      ok: false,
    };
  }
  const scope = await prisma.curriculumUnit.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
    where: {
      classId: target.classId,
      subjectId: target.subjectId,
      streamId: target.streamId,
      yearId: target.yearId,
    },
  });
  const index = scope.findIndex((row) => row.id === target.id);
  if (index < 0) {
    return { errors: { root: "This unit is no longer in scope." }, ok: false };
  }
  const neighborIndex = input.direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= scope.length) {
    return {
      errors: { root: "Already at the edge of this list." },
      ok: false,
    };
  }
  const neighbor = scope[neighborIndex];
  if (!neighbor) {
    return { errors: { root: "Nothing to swap with." }, ok: false };
  }
  await prisma.$transaction([
    prisma.curriculumUnit.update({
      data: { order: neighbor.order },
      where: { id: target.id },
    }),
    prisma.curriculumUnit.update({
      data: { order: target.order },
      where: { id: neighbor.id },
    }),
  ]);
  await logAudit({
    action: "reorder",
    actor,
    after: {
      direction: input.direction,
      scope: {
        classId: target.classId,
        streamId: target.streamId,
        subjectId: target.subjectId,
        yearId: target.yearId,
      },
      unitId: target.id,
    },
    before: null,
    entity: "curriculum-unit",
    entityId: target.id,
  });
  return { ok: true };
};

export type CurriculumMinimumResult =
  { ok: true } | { errors: Record<string, string>; ok: false };

export const setCurriculumMinimum = async (
  input: curriculumMinimumType,
): Promise<CurriculumMinimumResult> => {
  const parsed = curriculumMinimumSchema.safeParse(input);
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
  const { actor } = await requirePrincipalWriter();
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
  if (!schoolClass) {
    return { errors: { classId: "Pick a valid class." }, ok: false };
  }
  if (isLockedClassOrder(schoolClass.order)) {
    await logAudit({
      action: "permission-deny",
      actor,
      after: {
        blocked: true,
        classId: data.classId,
        reason: "minimum-locked-class",
      },
      before: null,
      entity: "curriculum-minimum",
      entityId: null,
    });
    return {
      errors: {
        classId: "Principal minimums apply to Nursery to Class 8 only.",
      },
      ok: false,
    };
  }
  if (
    data.minUnits < MIN_CURRICULUM_MINIMUM ||
    data.minUnits > MAX_CURRICULUM_MINIMUM
  ) {
    return {
      errors: {
        minUnits: `Minimum is ${MIN_CURRICULUM_MINIMUM} to ${MAX_CURRICULUM_MINIMUM}.`,
      },
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
  const existing = await prisma.curriculumMinimum.findUnique({
    where: {
      yearId_classId_subjectId: {
        classId: data.classId,
        subjectId: data.subjectId,
        yearId: data.yearId,
      },
    },
  });
  const before = existing ? toSafeMinimum(existing) : null;
  const row = await prisma.curriculumMinimum.upsert({
    create: {
      classId: data.classId,
      minUnits: data.minUnits,
      subjectId: data.subjectId,
      yearId: data.yearId,
    },
    update: { minUnits: data.minUnits },
    where: {
      yearId_classId_subjectId: {
        classId: data.classId,
        subjectId: data.subjectId,
        yearId: data.yearId,
      },
    },
  });
  const minimal =
    existing ?
      toMinimalAuditChange(before, toSafeMinimum(row))
    : { after: toSafeMinimum(row), before: null };
  await logAudit({
    action: existing ? "update" : "create",
    actor,
    after: minimal.after,
    before: minimal.before,
    entity: "curriculum-minimum",
    entityId: row.id,
  });
  return { ok: true };
};

export type LockedEditRequestResult =
  | { approvalId: string; ok: true }
  | { errors: Record<string, string>; ok: false };

export const requestCurriculumLockedEdit = async (
  input: curriculumLockedEditRequestType,
): Promise<LockedEditRequestResult> => {
  const parsed = curriculumLockedEditRequestSchema.safeParse(input);
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
  const { actor, session } = await requireLockedRequester();
  const { active } = await getFreshRoleContext(session.user.id);
  const isPrincipalRequester =
    active !== null && can(active, "academic:manage-curriculum");
  if (isPrincipalRequester) {
    const holders = await prisma.user.findMany({
      select: { id: true, role: true },
    });
    const otherPrincipal = holders.some(
      (row) =>
        row.id !== session.user.id &&
        parseRoleNames(row.role).includes("principal"),
    );
    if (!otherPrincipal) {
      await logAudit({
        action: "curriculum-locked-deny",
        actor,
        after: {
          blocked: true,
          reason: "single-principal-request-blocked",
          unitId: parsed.data.unitId,
        },
        before: null,
        entity: "approval",
        entityId: null,
      });
      return {
        errors: {
          root: "You are the only principal. Ask a teacher or the vice principal to submit this request so you can review and approve it.",
        },
        ok: false,
      };
    }
  }
  const unit = await prisma.curriculumUnit.findUnique({
    include: { class: true, year: true },
    where: { id: parsed.data.unitId },
  });
  if (!unit) {
    return { errors: { root: "This unit no longer exists." }, ok: false };
  }
  if (unit.source !== "CBSE_LOCKED") {
    return {
      errors: { root: "Only locked Class 9 to 12 units need this approval." },
      ok: false,
    };
  }
  if (unit.year.status === "CLOSED") {
    return { errors: { root: "This academic year is closed." }, ok: false };
  }
  const title = normalizeTitle(parsed.data.title);
  const siblings = await prisma.curriculumUnit.findMany({
    select: { id: true, streamId: true, title: true },
    where: {
      classId: unit.classId,
      id: { not: unit.id },
      subjectId: unit.subjectId,
      yearId: unit.yearId,
    },
  });
  const clash = siblings.find(
    (row) =>
      (row.streamId ?? null) === (unit.streamId ?? null) &&
      row.title.trim().toLowerCase() === title.toLowerCase(),
  );
  if (clash) {
    return {
      errors: { title: "This title already exists in this scope." },
      ok: false,
    };
  }
  const existingApprovals = await prisma.approvalRequest.findMany({
    select: { id: true, payload: true, status: true },
    where: {
      action: "curriculum_locked_edit",
      status: { in: ["PENDING", "APPROVED"] },
    },
  });
  const duplicate = existingApprovals.find((row) => {
    const payload = row.payload as unknown as Record<string, unknown> | null;
    return (
      payload !== null &&
      typeof payload === "object" &&
      payload["unitId"] === unit.id
    );
  });
  if (duplicate) {
    return {
      errors: {
        root:
          duplicate.status === "APPROVED" ?
            "This unit already has an approved edit. Apply it before requesting again."
          : "This unit already has a pending edit request.",
      },
      ok: false,
    };
  }
  const payload = {
    objectives: (parsed.data.objectives ?? "").trim() || "",
    reason: parsed.data.reason.trim(),
    title,
    unitId: unit.id,
  };
  const row = await prisma.approvalRequest.create({
    data: {
      action: "curriculum_locked_edit",
      payload,
      requestedBy: session.user.id,
      status: "PENDING",
    },
  });
  await logAudit({
    action: "approval-request",
    actor,
    after: {
      action: "curriculum_locked_edit",
      status: "PENDING",
      unitId: unit.id,
    },
    before: null,
    entity: "approval",
    entityId: row.id,
  });
  return { approvalId: row.id, ok: true };
};

type LockedEditPayload = {
  objectives: string;
  reason: string;
  title: string;
  unitId: string;
};

const parseLockedPayload = (payload: unknown): LockedEditPayload | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const unitId =
    typeof record.unitId === "string" && record.unitId.trim() !== "" ?
      record.unitId
    : null;
  const title =
    typeof record.title === "string" && record.title.trim() !== "" ?
      record.title.trim().slice(0, 120)
    : null;
  if (!unitId || !title) return null;
  const objectives =
    typeof record.objectives === "string" ?
      record.objectives.slice(0, 2000)
    : "";
  const reason =
    typeof record.reason === "string" ? record.reason.slice(0, 500) : "";
  return { objectives, reason, title, unitId };
};

export const executeCurriculumLockedEdit = async (
  approvalId: string,
  actorId: string,
): Promise<void> => {
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
  });
  if (!approval || approval.action !== "curriculum_locked_edit") {
    throw new Error("This locked edit request no longer exists.");
  }
  const payload = parseLockedPayload(approval.payload);
  if (!payload) {
    throw new Error("This locked edit payload is incomplete.");
  }
  const unit = await prisma.curriculumUnit.findUnique({
    include: { class: true, year: true },
    where: { id: payload.unitId },
  });
  if (!unit) {
    throw new Error("This unit no longer exists.");
  }
  if (unit.source !== "CBSE_LOCKED") {
    throw new Error("This unit is no longer locked.");
  }
  if (unit.year.status === "CLOSED") {
    throw new Error("This academic year is closed.");
  }
  if (!isLockedClassOrder(unit.class.order)) {
    throw new Error("This class is no longer locked.");
  }
  const siblings = await prisma.curriculumUnit.findMany({
    select: { id: true, streamId: true, title: true },
    where: {
      classId: unit.classId,
      id: { not: unit.id },
      subjectId: unit.subjectId,
      yearId: unit.yearId,
    },
  });
  const clash = siblings.find(
    (row) =>
      (row.streamId ?? null) === (unit.streamId ?? null) &&
      row.title.trim().toLowerCase() === payload.title.toLowerCase(),
  );
  if (clash) {
    throw new Error("This title already exists in this scope. Resubmit fresh.");
  }
  const before = toSafeUnit(unit);
  const row = await prisma.curriculumUnit.update({
    data: {
      objectives: payload.objectives.trim() || null,
      title: payload.title,
    },
    where: { id: unit.id },
  });
  const minimal = toMinimalAuditChange(before, toSafeUnit(row));
  await logAudit({
    action: "curriculum-locked-apply",
    actor: { id: actorId },
    after: { ...minimal.after, unitId: unit.id },
    before: minimal.before,
    entity: "curriculum-unit",
    entityId: unit.id,
  });
};

const requireLockedApprover = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (active && can(active, "academic:manage-curriculum")) {
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
      reason: "curriculum-approve-denied",
    },
    before: null,
    entity: "approval",
    entityId: null,
  });
  throw new ForbiddenError("academic:manage-curriculum");
};

export type LockedDecideResult =
  | { approvalId: string; ok: true; status: "APPROVED" | "REJECTED" }
  | { errors: Record<string, string>; ok: false };

export const decideCurriculumLockedEdit = async (input: {
  decision: "APPROVE" | "REJECT";
  id: string;
  reason?: string;
}): Promise<LockedDecideResult> => {
  const { session } = await requireLockedApprover();
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: input.id },
  });
  if (!approval || approval.action !== "curriculum_locked_edit") {
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

export type LockedApplyResult =
  { ok: true } | { errors: Record<string, string>; ok: false };

export const applyCurriculumLockedEdit = async (input: {
  id: string;
}): Promise<LockedApplyResult> => {
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
  if (!approval || approval.action !== "curriculum_locked_edit") {
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
        reason: "curriculum-apply-denied",
      },
      before: null,
      entity: "approval",
      entityId: approval.id,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  try {
    await executeCurriculumLockedEdit(approval.id, session.user.id);
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

export const getCurriculumCompliance = async (input: {
  classId: string;
  subjectId: string;
  yearId: string;
}): Promise<{ current: number; required: number }> => {
  const current = await prisma.curriculumUnit.count({
    where: {
      classId: input.classId,
      subjectId: input.subjectId,
      yearId: input.yearId,
    },
  });
  const required = await getRequiredCount(input);
  return { current, required };
};
