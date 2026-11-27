import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";

import type { Route } from "next";
import { auth, type Session } from "@/lib/auth";
import {
  can,
  parseRoleNames,
  resolveRolePath,
  type Permission,
  type RoleName,
} from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import { logAudit } from "@/server/audit";

// Dedupes the session lookup between the dashboard layouts and role pages.
const getSession = cache(async (): Promise<Session | null> => {
  const requestHeaders = await headers();
  return auth.api.getSession({ headers: requestHeaders });
});

export const requireSession = async (): Promise<Session> => {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
};

export const requireRole = async (role: RoleName): Promise<Session> => {
  const session = await requireSession();
  if (!parseRoleNames(session.user.role).includes(role)) {
    redirect(resolveRolePath(session.user.role) as Route);
  }
  return session;
};

export const requireAnyRole = async (
  roles: readonly RoleName[],
): Promise<Session> => {
  const session = await requireSession();
  const held = parseRoleNames(session.user.role);
  if (!roles.some((role) => held.includes(role))) {
    redirect(resolveRolePath(session.user.role) as Route);
  }
  return session;
};

export const requirePermission = async (
  permission: Permission,
): Promise<Session> => {
  const session = await requireSession();
  if (!can(session.user.role, permission)) {
    redirect(resolveRolePath(session.user.role) as Route);
  }
  return session;
};

export class ForbiddenError extends Error {
  permission: string;

  constructor(permission: string) {
    super(`FORBIDDEN: missing permission ${permission}`);
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

export const assertPermission = async (
  permission: Permission,
): Promise<Session> => {
  const session = await requireSession();
  if (!can(session.user.role, permission)) {
    throw new ForbiddenError(permission);
  }
  return session;
};

// Active role is the single write role. Views stay union through
// requirePermission and can. Writes must go through requireActivePermission
// so a multi role user acts with one audited role at a time.
export const getFreshRoleContext = async (userId: string) => {
  const row = await prisma.user.findUnique({
    select: { activeRole: true, id: true, role: true },
    where: { id: userId },
  });
  const held = parseRoleNames(row?.role);
  const active = (
    row?.activeRole && held.includes(row.activeRole as RoleName) ?
      row.activeRole
    : (held[0] ?? null)) as RoleName | null;
  return { active, held, row };
};

export const requireActiveRole = async (role: RoleName): Promise<Session> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (active !== role) {
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
        reason: "active-role-mismatch",
        required: role,
      },
      before: null,
      entity: "permission",
      entityId: session.user.id,
    });
    throw new ForbiddenError(`active:${role}`);
  }
  return session;
};

export const requireActivePermission = async (
  permission: Permission,
): Promise<Session> => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  if (!active || !can(active, permission)) {
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
        permission,
        reason: "active-permission-denied",
      },
      before: null,
      entity: "permission",
      entityId: session.user.id,
    });
    throw new ForbiddenError(permission);
  }
  return session;
};
