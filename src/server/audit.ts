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
