"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  can,
  findIncompatibleRoleCombo,
  parseRoleNames,
  roleNames,
  type ApprovalActionName,
  type RoleName,
} from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import {
  grantRoleSchema,
  revokeRoleSchema,
  switchActiveRoleSchema,
  type grantRoleType,
  type revokeRoleType,
  type switchActiveRoleType,
} from "@/lib/zodSchema";
import {
  logAudit,
  toMinimalAuditChange,
  toUserAuditSnapshot,
} from "@/server/audit";
import {
  assertPermission,
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

const ensureRoleRows = async (db: typeof prisma, slugs: readonly string[]) => {
  for (const slug of slugs) {
    const label = slug
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    await db.role.upsert({
      create: { label, slug },
      update: { label },
      where: { slug },
    });
  }
};

export const getHeldRoleSlugs = async (userId: string): Promise<RoleName[]> => {
  const rows = await prisma.userRole.findMany({
    include: { role: true },
    where: { userId },
  });
  const slugs = rows
    .map((row) => row.role.slug)
    .filter((slug) => (roleNames as readonly string[]).includes(slug));
  return slugs as RoleName[];
};

export const syncRoleCache = async (
  userId: string,
  db: typeof prisma = prisma,
) => {
  const rows = await db.userRole.findMany({
    include: { role: true },
    where: { userId },
  });
  const primary = rows
    .filter((row) => row.isPrimary)
    .map((row) => row.role.slug);
  const rest = rows
    .filter((row) => !row.isPrimary)
    .map((row) => row.role.slug)
    .sort();
  const ordered = [...primary, ...rest];
  const cache = ordered.join(",");
  const user = await db.user.findUnique({ where: { id: userId } });
  const data: { activeRole?: string | null; role?: string } = { role: cache };
  if (user && !user.activeRole) {
    data.activeRole = ordered[0] ?? null;
  }
  if (user && user.activeRole && !ordered.includes(user.activeRole)) {
    data.activeRole = ordered[0] ?? null;
  }
  await db.user.update({ data, where: { id: userId } });
  return ordered;
};

export type RoleMutationResult =
  | { ok: true; roles: string[] }
  | { errors: Partial<Record<"role" | "root", string>>; ok: false };

export const grantRole = async (
  input: grantRoleType,
): Promise<RoleMutationResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const parsed = grantRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { errors: { role: "Pick a valid role" }, ok: false };
  }
  const { id, role } = parsed.data;
  if (role === "owner") {
    await logAudit({
      action: "grant-role",
      actor,
      after: { blocked: true, reason: "owner-role-blocked" },
      before: null,
      entity: "user_role",
      entityId: id,
    });
    return {
      errors: { role: "The owner role cannot be assigned here." },
      ok: false,
    };
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return { errors: { root: "This user no longer exists." }, ok: false };
  }

  const held = await getHeldRoleSlugs(id);
  if (held.includes(role as RoleName)) {
    return {
      errors: { role: "This user already holds that role." },
      ok: false,
    };
  }
  const next = [...held, role as RoleName];
  const problem = findIncompatibleRoleCombo(next);
  if (problem) {
    return { errors: { role: problem }, ok: false };
  }

  await ensureRoleRows(prisma, [role]);
  const roleRow = await prisma.role.findUniqueOrThrow({
    where: { slug: role },
  });
  const beforeFull = toUserAuditSnapshot(target);
  await prisma.userRole.create({
    data: {
      assignedBy: actor.id,
      isPrimary: held.length === 0,
      roleId: roleRow.id,
      userId: id,
    },
  });
  const ordered = await syncRoleCache(id);
  const row = await prisma.user.findUniqueOrThrow({ where: { id } });
  const minimal = toMinimalAuditChange(beforeFull, toUserAuditSnapshot(row));
  await logAudit({
    action: "grant-role",
    actor,
    after: { ...minimal.after, granted: role },
    before: minimal.before,
    entity: "user_role",
    entityId: id,
  });
  try {
    const requestHeaders = await headers();
    await auth.api.revokeUserSessions({
      body: { userId: id },
      headers: requestHeaders,
    });
  } catch {
    // Session revoke is best effort. Role rows are already correct.
  }
  return { ok: true, roles: ordered };
};

export const revokeRole = async (
  input: revokeRoleType,
): Promise<RoleMutationResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const parsed = revokeRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { errors: { role: "Pick a valid role" }, ok: false };
  }
  const { id, role } = parsed.data;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return { errors: { root: "This user no longer exists." }, ok: false };
  }
  const held = await getHeldRoleSlugs(id);
  if (!held.includes(role as RoleName)) {
    return {
      errors: { role: "This user does not hold that role." },
      ok: false,
    };
  }
  if (held.length <= 1) {
    return {
      errors: { root: "A user must keep at least one role." },
      ok: false,
    };
  }
  if (actor.id === target.id) {
    await logAudit({
      action: "revoke-role",
      actor,
      after: { blocked: true, reason: "self-revoke-blocked" },
      before: null,
      entity: "user_role",
      entityId: id,
    });
    return {
      errors: { root: "Use your profile to change your own roles." },
      ok: false,
    };
  }

  const roleRow = await prisma.role.findUnique({ where: { slug: role } });
  const beforeFull = toUserAuditSnapshot(target);
  if (roleRow) {
    await prisma.userRole.deleteMany({
      where: { roleId: roleRow.id, userId: id },
    });
  }
  const ordered = await syncRoleCache(id);
  const row = await prisma.user.findUniqueOrThrow({ where: { id } });
  const minimal = toMinimalAuditChange(beforeFull, toUserAuditSnapshot(row));
  await logAudit({
    action: "revoke-role",
    actor,
    after: { ...minimal.after, revoked: role },
    before: minimal.before,
    entity: "user_role",
    entityId: id,
  });
  try {
    const requestHeaders = await headers();
    await auth.api.revokeUserSessions({
      body: { userId: id },
      headers: requestHeaders,
    });
  } catch {
    // Session revoke is best effort. Role rows are already correct.
  }
  return { ok: true, roles: ordered };
};

export const switchActiveRole = async (
  input: switchActiveRoleType,
): Promise<
  | { ok: true; activeRole: string }
  | { errors: Partial<Record<"role" | "root", string>>; ok: false }
> => {
  const session = await requireSession();
  const parsed = switchActiveRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { errors: { role: "Pick a valid role" }, ok: false };
  }
  const held = await getHeldRoleSlugs(session.user.id);
  if (!held.includes(parsed.data.role as RoleName)) {
    await logAudit({
      action: "switch-role",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: { blocked: true, reason: "not-held" },
      before: null,
      entity: "user_role",
      entityId: session.user.id,
    });
    return { errors: { role: "You do not hold that role." }, ok: false };
  }
  await prisma.user.update({
    data: { activeRole: parsed.data.role },
    where: { id: session.user.id },
  });
  return { ok: true, activeRole: parsed.data.role };
};

export const getActiveRole = async (): Promise<RoleName | null> => {
  const session = await requireSession();
  const fresh = await prisma.user.findUnique({
    select: { activeRole: true, role: true },
    where: { id: session.user.id },
  });
  const held = parseRoleNames(fresh?.role);
  if (fresh?.activeRole && held.includes(fresh.activeRole as RoleName)) {
    return fresh.activeRole as RoleName;
  }
  return held[0] ?? null;
};

import { approvalExecutors } from "@/server/admin/approvalRegistry";

export type DecideOutcome =
  | { kind: "ALLOW" }
  | { kind: "DENY"; reason: string }
  | { kind: "REQUIRES_APPROVAL"; approvalId: string };

export const createApprovalRequest = async (args: {
  action: ApprovalActionName;
  payload?: Record<string, unknown>;
  requestedBy: string;
}): Promise<string> => {
  const session = await requireSession();
  if (args.requestedBy !== session.user.id) {
    throw new ForbiddenError("approval-request");
  }
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
        action: args.action,
        blocked: true,
        reason: "approval-request-denied",
      },
      before: null,
      entity: "approval",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  const safePayload: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(args.payload ?? {})) {
    const lowered = key.toLowerCase();
    if (
      lowered.includes("token") ||
      lowered.includes("password") ||
      lowered.includes("secret")
    ) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safePayload[key] = value;
    }
  }
  const row = await prisma.approvalRequest.create({
    data: {
      action: args.action,
      payload: safePayload,
      requestedBy: args.requestedBy,
      status: "PENDING",
    },
  });
  await logAudit({
    action: "approval-request",
    actor: { id: args.requestedBy },
    after: { action: args.action, status: "PENDING" },
    before: null,
    entity: "approval",
    entityId: row.id,
  });
  return row.id;
};

export const decideApproval = async (args: {
  approvalId: string;
  deciderId: string;
  decision: "APPROVE" | "REJECT";
  reason?: string;
}): Promise<DecideOutcome> => {
  const session = await requireSession();
  if (args.deciderId !== session.user.id) {
    throw new ForbiddenError("approval-decide");
  }
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: args.approvalId },
  });
  if (!approval || approval.status !== "PENDING") {
    return { kind: "DENY", reason: "This request is no longer pending." };
  }
  if (approval.requestedBy === args.deciderId) {
    await logAudit({
      action: "approval-decide",
      actor: { id: args.deciderId },
      after: { blocked: true, reason: "self-approval-blocked" },
      before: { action: approval.action, status: approval.status },
      entity: "approval",
      entityId: approval.id,
    });
    return { kind: "DENY", reason: "You cannot approve your own request." };
  }
  const now = new Date();
  const ageDays = (now.getTime() - approval.createdAt.getTime()) / 86400000;
  if (ageDays > 30) {
    await prisma.approvalRequest.update({
      data: { status: "EXPIRED" },
      where: { id: approval.id },
    });
    await logAudit({
      action: "approval-expire",
      actor: { id: args.deciderId },
      after: { action: approval.action, status: "EXPIRED" },
      before: { action: approval.action, status: "PENDING" },
      entity: "approval",
      entityId: approval.id,
    });
    return {
      kind: "DENY",
      reason: "This request has expired. Resubmit with fresh data.",
    };
  }
  if (args.decision === "REJECT") {
    if (!args.reason?.trim()) {
      return { kind: "DENY", reason: "A reason is required to reject." };
    }
    await prisma.approvalRequest.update({
      data: {
        decidedAt: now,
        decidedBy: args.deciderId,
        reason: args.reason.trim(),
        status: "REJECTED",
      },
      where: { id: approval.id },
    });
    await logAudit({
      action: "approval-reject",
      actor: { id: args.deciderId },
      after: { action: approval.action, status: "REJECTED" },
      before: { action: approval.action, status: "PENDING" },
      entity: "approval",
      entityId: approval.id,
    });
    return { kind: "DENY", reason: "Request rejected." };
  }
  await prisma.approvalRequest.update({
    data: { decidedAt: now, decidedBy: args.deciderId, status: "APPROVED" },
    where: { id: approval.id },
  });
  await logAudit({
    action: "approval-approve",
    actor: { id: args.deciderId },
    after: { action: approval.action, status: "APPROVED" },
    before: { action: approval.action, status: "PENDING" },
    entity: "approval",
    entityId: approval.id,
  });
  return { approvalId: approval.id, kind: "REQUIRES_APPROVAL" };
};

export const applyApproval = async (
  approvalId: string,
  actorId: string,
): Promise<void> => {
  const session = await requireSession();
  if (actorId !== session.user.id) {
    throw new ForbiddenError("approval-apply");
  }
  const { active } = await getFreshRoleContext(session.user.id);
  if (
    !active ||
    (!can(active, "academic:manage-curriculum") &&
      !can(active, "system:manage"))
  ) {
    await logAudit({
      action: "permission-deny",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: { blocked: true, reason: "approval-apply-denied" },
      before: null,
      entity: "approval",
      entityId: approvalId,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
  });
  if (!approval || approval.status !== "APPROVED") {
    throw new Error("Only approved requests can be applied.");
  }
  const executor = approvalExecutors[approval.action as ApprovalActionName];
  if (!executor) {
    throw new Error(`Unknown approval action ${approval.action}.`);
  }
  try {
    await executor(approval.id, actorId);
    await prisma.approvalRequest.update({
      data: { appliedAt: new Date(), appliedBy: actorId, status: "APPLIED" },
      where: { id: approval.id },
    });
    await logAudit({
      action: "approval-apply",
      actor: { id: actorId },
      after: { action: approval.action, status: "APPLIED" },
      before: { action: approval.action, status: "APPROVED" },
      entity: "approval",
      entityId: approval.id,
    });
  } catch (error) {
    await prisma.approvalRequest.update({
      data: {
        reason:
          error instanceof Error ? error.message.slice(0, 500) : "Apply failed",
        status: "FAILED",
      },
      where: { id: approval.id },
    });
    await logAudit({
      action: "approval-failed",
      actor: { id: actorId },
      after: { action: approval.action, status: "FAILED" },
      before: { action: approval.action, status: "APPROVED" },
      entity: "approval",
      entityId: approval.id,
    });
    throw error;
  }
};

// Single CURRENT year guard. A1 and H0 reuse this so clone and promotion
// cannot create a second CURRENT year outside a transaction.
export const assertSingleCurrentYear = async (
  db: typeof prisma,
  excludeId?: string,
) => {
  const current = await db.academicYear.findMany({
    where: { status: "CURRENT" },
  });
  const others =
    excludeId ? current.filter((year) => year.id !== excludeId) : current;
  if (others.length > 0) {
    throw new Error("Only one CURRENT academic year is allowed.");
  }
};

export const backfillUserRoles = async () => {
  const users = await prisma.user.findMany({
    select: { id: true, role: true },
  });
  await ensureRoleRows(prisma, [...roleNames]);
  for (const user of users) {
    const held = parseRoleNames(user.role);
    const slugs = held.length > 0 ? held : (["student"] as RoleName[]);
    for (const slug of slugs) {
      const roleRow = await prisma.role.findUnique({ where: { slug } });
      if (!roleRow) continue;
      await prisma.userRole.upsert({
        create: {
          assignedAt: new Date(),
          isPrimary: slug === slugs[0],
          roleId: roleRow.id,
          userId: user.id,
        },
        update: {},
        where: { userId_roleId: { roleId: roleRow.id, userId: user.id } },
      });
    }
    await syncRoleCache(user.id);
  }
};
