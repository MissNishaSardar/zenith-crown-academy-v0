"use server";

import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { parseRoleNames } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";

const getSession = cache(async () => {
  const requestHeaders = await headers();
  return auth.api.getSession({ headers: requestHeaders });
});

export type AuditAction =
  | "user.create"
  | "user.update"
  | "user.role_set"
  | "user.password_set"
  | "user.ban"
  | "user.unban"
  | "user.delete"
  | "user.impersonate"
  | "impersonate.stop"
  | "session.revoke"
  | "session.revoke_all";

export type AuditTarget = {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
};

export const logAudit = async ({
  action,
  target,
  details,
}: {
  action: AuditAction;
  target?: AuditTarget;
  details?: Record<string, unknown>;
}): Promise<void> => {
  const session = await getSession();
  if (!session) {
    throw new Error("Not authorized");
  }

  if (!parseRoleNames(session.user.role).includes("super_admin")) {
    throw new Error("Not authorized");
  }

  try {
    await prisma.auditLog.create({
      data: {
        action,
        actorId: session.user.id,
        actorName: session.user.name,
        actorEmail: session.user.email,
        targetUserId: target?.userId ?? null,
        targetName: target?.name ?? null,
        targetEmail: target?.email ?? null,
        details: JSON.stringify(details ?? {}),
      },
    });
  } catch {
    throw new Error("Failed to record audit log");
  }
};
