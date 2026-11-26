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
  memoryTotalMb: number | null;
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
      message: "Classes and sign in are working.",
      ok: true,
      sessionCount,
      userCount,
    };
  } catch {
    return {
      latencyMs: null,
      message: "Classes and sign in need attention. Try again shortly.",
      ok: false,
      sessionCount: null,
      userCount: null,
    };
  }
};

const checkStorage = async (): Promise<StorageHealth> => {
  try {
    await access(join(process.cwd(), "public", "uploads"), constants.W_OK);
    return { message: "File uploads can save.", ok: true };
  } catch {
    return { message: "File uploads cannot save right now.", ok: false };
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
    message: ok ? "Settings are complete." : "Some settings are missing.",
    ok,
  };
};

const checkRuntime = async (): Promise<RuntimeHealth> => {
  try {
    const usage = process.memoryUsage();
    const memoryMb = Math.round(usage.heapUsed / 1024 / 1024);
    const memoryTotalMb = Math.round(usage.heapTotal / 1024 / 1024);
    return {
      memoryMb,
      memoryTotalMb,
      message: "Server readings look normal.",
      nodeVersion: process.version,
      ok: true,
      uptimeSec: Math.round(process.uptime()),
    };
  } catch {
    return {
      memoryMb: null,
      memoryTotalMb: null,
      message: "Server readings are unavailable.",
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
