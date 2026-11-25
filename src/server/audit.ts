import prisma from "@/lib/dbClient/prisma";

type AuditDb = {
  auditLog: {
    create(args: {
      data: {
        actorId?: string | null | undefined;
        actorEmail?: string | null | undefined;
        actorRole?: string | null | undefined;
        action: string;
        entity: string;
        entityId?: string | null | undefined;
        before?: object | undefined;
        after?: object | undefined;
      };
    }): Promise<unknown>;
  };
};

type AuditActor = {
  id?: string | null | undefined;
  email?: string | null | undefined;
  role?: string | null | undefined;
} | null;

export type LogAuditInput = {
  action: string;
  entity: string;
  entityId?: string | null | undefined;
  before?: unknown;
  after?: unknown;
  actor?: AuditActor;
};

type LogAuditOptions = {
  db?: AuditDb | undefined;
};

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "hashedpassword",
  "passwd",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "idtoken",
  "id_token",
  "sessiontoken",
  "session_token",
  "sessionid",
  "session_id",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "cookies",
]);

const SENSITIVE_SUBSTRINGS = [
  "password",
  "passwd",
  "token",
  "secret",
  "cookie",
  "session",
  "authorization",
  "apikey",
];

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[_-]+/g, "");
  if (SENSITIVE_KEYS.has(key.toLowerCase())) {
    return true;
  }
  if (SENSITIVE_KEYS.has(normalized)) {
    return true;
  }
  return SENSITIVE_SUBSTRINGS.some((part) => normalized.includes(part));
};

const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (isSensitiveKey(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactValue(entry);
    }
    return out;
  }
  return value;
};

const toJsonInput = (value: unknown): object | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const redacted = redactValue(value);
  if (redacted !== null && typeof redacted === "object") {
    return redacted as object;
  }
  return { value: redacted };
};

export const logAudit = async (
  input: LogAuditInput,
  options?: LogAuditOptions,
): Promise<void> => {
  const action = input.action.trim();
  const entity = input.entity.trim();
  if (!action) {
    throw new Error("logAudit requires a non-empty action");
  }
  if (!entity) {
    throw new Error("logAudit requires a non-empty entity");
  }
  const db = options?.db ?? prisma;
  await db.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? null,
      actorRole: input.actor?.role ?? null,
      action,
      entity,
      entityId: input.entityId ?? null,
      before: toJsonInput(input.before),
      after: toJsonInput(input.after),
    },
  });
};

// Allowlist for User audit snapshots. New sensitive columns stay out by
// default and must be added here explicitly before they can be logged.
export const USER_AUDIT_FIELDS = [
  "name",
  "username",
  "email",
  "role",
  "banned",
  "banReason",
  "banExpires",
  "emailVerified",
] as const;

export type UserAuditField = (typeof USER_AUDIT_FIELDS)[number];

export type AuditFieldDiff = {
  after: unknown;
  before: unknown;
  field: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const toUserAuditSnapshot = (user: unknown): Record<string, unknown> => {
  if (!isRecord(user)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const field of USER_AUDIT_FIELDS) {
    if (field in user) {
      const value = user[field];
      out[field] =
        value instanceof Date ? value.toISOString() : redactValue(value);
    }
  }
  return out;
};

const normalizeForCompare = (value: unknown): string => {
  if (value === undefined) {
    return "__undefined__";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export const diffAuditFields = (
  before: unknown,
  after: unknown,
): AuditFieldDiff[] => {
  const beforeRecord = isRecord(before) ? before : {};
  const afterRecord = isRecord(after) ? after : {};
  const fields = new Set([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord),
  ]);
  const diffs: AuditFieldDiff[] = [];
  for (const field of fields) {
    // Coalesce missing and undefined to null before comparing so the
    // comparison agrees with the emitted values below. Otherwise an
    // explicitly undefined field versus a missing field would render a
    // phantom change row reading "— → —".
    const beforeValue = beforeRecord[field] ?? null;
    const afterValue = afterRecord[field] ?? null;
    if (normalizeForCompare(beforeValue) !== normalizeForCompare(afterValue)) {
      diffs.push({ after: afterValue, before: beforeValue, field });
    }
  }
  diffs.sort((a, b) => a.field.localeCompare(b.field));
  return diffs;
};

export const AUDIT_ENTITY_OPTIONS = ["user"] as const;

export const AUDIT_USER_ACTION_OPTIONS = [
  "ban",
  "create",
  "revoke",
  "set-password",
  "set-role",
  "unban",
  "update",
] as const;
