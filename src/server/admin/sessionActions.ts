"use server";

import { cookies, headers } from "next/headers";

import { auth } from "@/lib/auth";
import { can, parseRoleNames } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import {
  revokeAllUserSessionsSchema,
  revokeSessionSchema,
  type revokeAllUserSessionsType,
  type revokeSessionType,
} from "@/lib/zodSchema";
import { logAudit } from "@/server/audit";
import { assertPermission } from "@/server/guards";

export type RevokeSessionResult =
  | {
      ok: true;
      session: { id: string };
    }
  | {
      errors: Partial<Record<"root", string>>;
      ok: false;
    };

export type RevokeAllUserSessionsResult =
  | {
      ok: true;
      revokedCount: number;
    }
  | {
      errors: Partial<Record<"root", string>>;
      ok: false;
    };

export const revokeAllUserSessions = async (
  input: revokeAllUserSessionsType,
): Promise<RevokeAllUserSessionsResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const parsed = revokeAllUserSessionsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
    };
  }
  const { userId } = parsed.data;

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) {
    return {
      errors: { root: "This user no longer exists." },
      ok: false,
    };
  }
  if (parseRoleNames(targetUser.role).includes("owner")) {
    await logAudit({
      action: "revoke",
      actor,
      after: { blocked: true, reason: "owner-blocked" },
      before: null,
      entity: "user",
      entityId: targetUser.id,
    });
    return {
      errors: { root: "Owner accounts cannot be changed here." },
      ok: false,
    };
  }

  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders });
  const currentSessionId = current?.session.id ?? null;

  const activeSessions = await prisma.session.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, token: true },
    where: { expiresAt: { gt: new Date() }, userId },
  });
  const revokable = activeSessions.filter((row) => row.id !== currentSessionId);
  if (revokable.length === 0) {
    return {
      errors: {
        root:
          targetUser.id === session.user.id ?
            "Only your current session is active. Sign out instead to end it."
          : "This user has no other active sessions.",
      },
      ok: false,
    };
  }

  let revokedCount = 0;
  for (const row of revokable) {
    try {
      await auth.api.revokeUserSession({
        body: { sessionToken: row.token },
        headers: requestHeaders,
      });
      await logAudit({
        action: "revoke",
        actor,
        after: {
          reason: "session-revoke-all",
          sessionId: row.id,
          userId,
        },
        before: null,
        entity: "user",
        entityId: userId,
      });
      revokedCount += 1;
    } catch {
      return {
        errors: {
          root: `Revoked ${revokedCount} of ${revokable.length} sessions before an error stopped the rest. Try again for the remainder.`,
        },
        ok: false,
      };
    }
  }
  return { ok: true, revokedCount };
};

export const revokeSession = async (
  input: revokeSessionType,
): Promise<RevokeSessionResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const parsed = revokeSessionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
    };
  }
  const { sessionId } = parsed.data;

  const target = await prisma.session.findUnique({
    include: { user: true },
    where: { id: sessionId },
  });
  if (!target) {
    return {
      errors: { root: "This session no longer exists." },
      ok: false,
    };
  }
  if (parseRoleNames(target.user.role).includes("owner")) {
    await logAudit({
      action: "revoke",
      actor,
      after: { blocked: true, reason: "owner-blocked" },
      before: null,
      entity: "user",
      entityId: target.userId,
    });
    return {
      errors: { root: "Owner accounts cannot be changed here." },
      ok: false,
    };
  }
  if (target.expiresAt <= new Date()) {
    return {
      errors: { root: "This session already expired." },
      ok: false,
    };
  }

  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders });
  if (current && current.session.id === target.id) {
    await logAudit({
      action: "revoke",
      actor,
      after: { blocked: true, reason: "self-current-session-blocked" },
      before: null,
      entity: "user",
      entityId: target.userId,
    });
    return {
      errors: { root: "This is your current session. Sign out instead." },
      ok: false,
    };
  }

  try {
    await auth.api.revokeUserSession({
      body: { sessionToken: target.token },
      headers: requestHeaders,
    });
    await logAudit({
      action: "revoke",
      actor,
      after: {
        reason: "session-revoke",
        sessionId: target.id,
        userId: target.userId,
      },
      before: null,
      entity: "user",
      entityId: target.userId,
    });
    return { ok: true, session: { id: target.id } };
  } catch {
    return {
      errors: { root: "Could not revoke this session. Try again." },
      ok: false,
    };
  }
};

const splitCombinedSetCookie = (combined: string): string[] => {
  // Headers.get("set-cookie") joins multiple cookies with ", ", but Expires
  // dates also contain ", ". Protect the weekday comma inside Expires values
  // before splitting so a single cookie is never torn apart.
  const placeholder = "\u0000";
  const protectedValue = combined.replace(
    /(expires=\w{3}), /gi,
    `$1${placeholder} `,
  );
  return protectedValue
    .split(/,\s*(?=[^=;]+=[^;]*)/)
    .map((part) => part.split(placeholder).join(","))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

const readSetCookies = (responseHeaders: Headers): string[] => {
  const getSetCookie = (
    responseHeaders as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(responseHeaders);
  }
  const combined = responseHeaders.get("set-cookie");
  if (!combined) {
    return [];
  }
  return splitCombinedSetCookie(combined);
};

const forwardSetCookies = async (setCookies: string[]): Promise<void> => {
  const store = await cookies();
  for (const entry of setCookies) {
    const parts = entry.split(";");
    const pair = parts[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    const rawValue = pair.slice(separator + 1).trim();
    if (!name) {
      continue;
    }
    // Better Auth signs cookie values with percent encoded bytes. Next.js
    // encodes values again in cookies().set, so decode once here. The set
    // then round trips to the exact bytes Better Auth signed, otherwise
    // signature verification fails and the session reads as signed out.
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      value = rawValue;
    }
    const options: {
      expires?: Date;
      httpOnly?: boolean;
      maxAge?: number;
      path?: string;
      sameSite?: "lax" | "none" | "strict";
      secure?: boolean;
    } = {};
    for (const attribute of parts.slice(1)) {
      const sections = attribute.trim().split("=");
      const key = (sections[0] ?? "").trim().toLowerCase();
      const attributeValue = sections.slice(1).join("=").trim();
      if (key === "path" && attributeValue) {
        options.path = attributeValue;
      } else if (key === "max-age" && attributeValue) {
        const maxAge = Number(attributeValue);
        if (Number.isFinite(maxAge) && maxAge >= 0) {
          options.maxAge = maxAge;
        }
      } else if (key === "expires" && attributeValue) {
        const expires = new Date(attributeValue);
        if (!Number.isNaN(expires.getTime())) {
          options.expires = expires;
        }
      } else if (key === "httponly") {
        options.httpOnly = true;
      } else if (key === "secure") {
        options.secure = true;
      } else if (key === "samesite" && attributeValue) {
        const normalized = attributeValue.toLowerCase();
        if (
          normalized === "lax" ||
          normalized === "strict" ||
          normalized === "none"
        ) {
          options.sameSite = normalized;
        }
      }
    }
    store.set(name, value, options);
  }
};

const isEffectivelyBanned = (
  banned: boolean,
  banExpires: Date | null,
): boolean => banned && (banExpires === null || banExpires > new Date());

export type StopImpersonationResult =
  | {
      ok: true;
    }
  | {
      errors: Partial<Record<"root", string>>;
      ok: false;
    };

// Stop-only escape hatch for sessions that were impersonated before
// impersonation was removed. There is intentionally no start action here,
// and no impersonate permission in the access statement, so Better Auth
// denies any new impersonate-user call while legacy sessions can still exit.
export const stopImpersonation = async (): Promise<StopImpersonationResult> => {
  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders });
  const impersonatedBy = (
    current?.session as unknown as
      { impersonatedBy?: string | null | undefined } | undefined
  )?.impersonatedBy;
  if (!current || !impersonatedBy) {
    return {
      errors: { root: "You are not impersonating anyone." },
      ok: false,
    };
  }
  const adminUser = await prisma.user.findUnique({
    where: { id: impersonatedBy },
  });
  if (
    !adminUser ||
    !can(adminUser.role, "system:manage") ||
    isEffectivelyBanned(adminUser.banned, adminUser.banExpires)
  ) {
    return {
      errors: {
        root: "Your administrator session is no longer valid. Sign in again.",
      },
      ok: false,
    };
  }
  const actor = {
    email: adminUser.email,
    id: adminUser.id,
    role: adminUser.role,
  };
  const impersonatedUserId = current.session.userId;

  try {
    const { headers: responseHeaders } = await auth.api.stopImpersonating({
      headers: requestHeaders,
      returnHeaders: true,
    });
    await forwardSetCookies(readSetCookies(responseHeaders));
    await logAudit({
      action: "stop-impersonating",
      actor,
      after: {
        impersonatedUserId,
        reason: "impersonation-stop",
        userId: adminUser.id,
      },
      before: null,
      entity: "user",
      entityId: adminUser.id,
    });
    return { ok: true };
  } catch {
    return {
      errors: { root: "Could not stop impersonation. Try again." },
      ok: false,
    };
  }
};
