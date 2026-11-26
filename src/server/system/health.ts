import { access, constants } from "node:fs/promises";
import { join } from "node:path";

import prisma from "@/lib/dbClient/prisma";

export const APP_VERSION = "2.0.0";

export type DatabaseHealth = {
  latencyMs: number | null;
  message: string;
  ok: boolean;
  sessionCount: number | null;
  userCount: number | null;
};

export type StorageHealth = {
  message: string;
  ok: boolean;
};

export type EnvHealth = {
  betterAuthSecretSet: boolean;
  betterAuthUrlSet: boolean;
  databaseUrlSet: boolean;
  message: string;
  ok: boolean;
};

export type RuntimeHealth = {
  memoryMb: number | null;
  message: string;
  nodeVersion: string;
  ok: boolean;
  uptimeSec: number;
};

export type HealthSnapshot = {
  database: DatabaseHealth;
  env: EnvHealth;
  runtime: RuntimeHealth;
  status: "degraded" | "ok";
  storage: StorageHealth;
  timestamp: string;
  version: string;
};

export type PublicHealth = {
  db: {
    latencyMs: number | null;
    reachable: boolean;
  };
  status: "degraded" | "ok";
  timestamp: string;
  version: string;
};

const checkDatabase = async (): Promise<DatabaseHealth> => {
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [userCount, sessionCount] = await Promise.all([
      prisma.user.count(),
      prisma.session.count(),
    ]);
    return {
      latencyMs: Math.round(performance.now() - startedAt),
      message: "Database is reachable.",
      ok: true,
      sessionCount,
      userCount,
    };
  } catch {
    return {
      latencyMs: null,
      message: "Database is unreachable.",
      ok: false,
      sessionCount: null,
      userCount: null,
    };
  }
};

const checkStorage = async (): Promise<StorageHealth> => {
  try {
    await access(join(process.cwd(), "public", "uploads"), constants.W_OK);
    return { message: "Uploads directory is writable.", ok: true };
  } catch {
    return { message: "Uploads directory is not writable.", ok: false };
  }
};

const checkEnv = async (): Promise<EnvHealth> => {
  const databaseUrlSet = (process.env.DATABASE_URL ?? "").length > 0;
  const betterAuthUrlSet = (process.env.BETTER_AUTH_URL ?? "").length > 0;
  const betterAuthSecretSet = (process.env.BETTER_AUTH_SECRET ?? "").length > 0;
  const ok = databaseUrlSet && betterAuthUrlSet && betterAuthSecretSet;
  return {
    betterAuthSecretSet,
    betterAuthUrlSet,
    databaseUrlSet,
    message:
      ok ?
        "Required env values are set."
      : "One or more env values are missing.",
    ok,
  };
};

const checkRuntime = async (): Promise<RuntimeHealth> => {
  try {
    const memoryMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    return {
      memoryMb,
      message: "Runtime readings collected.",
      nodeVersion: process.version,
      ok: true,
      uptimeSec: Math.round(process.uptime()),
    };
  } catch {
    return {
      memoryMb: null,
      message: "Runtime readings unavailable.",
      nodeVersion: "unknown",
      ok: false,
      uptimeSec: 0,
    };
  }
};

export const getHealthSnapshot = async (): Promise<HealthSnapshot> => {
  const [database, storage, env, runtime] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkEnv(),
    checkRuntime(),
  ]);
  const status =
    database.ok && storage.ok && env.ok && runtime.ok ? "ok" : "degraded";
  return {
    database,
    env,
    runtime,
    status,
    storage,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
};

export const toPublicHealth = (snapshot: HealthSnapshot): PublicHealth => ({
  db: {
    latencyMs: snapshot.database.latencyMs,
    reachable: snapshot.database.ok,
  },
  status: snapshot.database.ok ? "ok" : "degraded",
  timestamp: snapshot.timestamp,
  version: snapshot.version,
});
