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
