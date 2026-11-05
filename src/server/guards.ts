import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";

import type { Route } from "next";
import { auth, type Session } from "@/lib/auth";
import {
  parseRoleNames,
  resolveRolePath,
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
