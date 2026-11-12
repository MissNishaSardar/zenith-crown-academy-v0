import type { Metadata } from "next";

import fs from "node:fs/promises";
import path from "node:path";

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Archive,
  CheckCircle2,
  CircleOff,
  HardDrive,
  HelpCircle,
  KeyRound,
  Server,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import AuditActivityList, {
  type AuditActivityRow,
} from "@/components/SuperAdmin/AuditActivityList";
import RecheckButton from "@/components/SuperAdmin/RecheckButton";
import RelativeTime from "@/components/SuperAdmin/RelativeTime";
import { Badge } from "@/components/shadcnui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcnui/tooltip";
import prisma from "@/lib/dbClient/prisma";
import { serverEnv } from "@/lib/env/serverEnv";
import { statusTones, type StatusTone } from "@/lib/statusTones";
import { dateTimeFmt, timeFmt } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "System Health",
};

const DB_WARN_MS = 200;
const SESSIONS_WARN_EXPIRED = 50;
const SESSIONS_WARN_AGE_DAYS = 7;
const DISK_WARN_PCT = 80;
const DISK_FAIL_PCT = 95;

const sectionTitleClass =
  "font-heading text-lg font-semibold tracking-tight text-foreground";

type HealthCounts = {
  activeSessions: number;
  expiredSessions: number;
  lastAuditAt: Date | null;
  oldestExpiredAt: Date | null;
};

const loadHealthCounts = async (now: Date): Promise<HealthCounts> => {
  const [activeSessions, expiredSessions, lastAudit, oldestExpired] =
    await Promise.all([
      prisma.session.count({ where: { expiresAt: { gt: now } } }),
      prisma.session.count({ where: { expiresAt: { lte: now } } }),
      prisma.auditLog.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.session.findFirst({
        where: { expiresAt: { lte: now } },
        orderBy: { expiresAt: "asc" },
        select: { expiresAt: true },
      }),
    ]);

  return {
    activeSessions,
    expiredSessions,
    lastAuditAt: lastAudit?.createdAt ?? null,
    oldestExpiredAt: oldestExpired?.expiresAt ?? null,
  };
};

type DiskStats = {
  totalBytes: number;
  freeBytes: number;
  usedPct: number;
};

const dbFilePath = (): string => {
  const raw = serverEnv.DATABASE_URL.replace(/^file:/, "");
  // Query parameters after ? are connection options, not part of the path.
  const file = raw.split("?")[0];
  if (!file) {
    return process.cwd();
  }
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
};

const loadDiskStats = async (): Promise<DiskStats | null> => {
  try {
    const stats = await fs.statfs(dbFilePath());
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    if (totalBytes <= 0) {
      return null;
    }
    return {
      totalBytes,
      freeBytes,
      usedPct: ((totalBytes - freeBytes) / totalBytes) * 100,
    };
  } catch {
    return null;
  }
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 GB";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit >= 3 ? value.toFixed(1) : Math.round(value).toString();
  return `${rounded} ${units[unit]}`;
};

type StatusRowProps = {
  label: string;
  value: ReactNode;
};

const StatusRow = ({ label, value }: StatusRowProps) => (
  <div className="border-border/60 flex items-center justify-between gap-4 border-t py-2 first:border-t-0 first:pt-0 last:pb-0">
    <dt className="text-muted-foreground text-sm leading-tight">{label}</dt>
    <dd className="text-foreground max-w-[65%] text-right text-sm font-medium [overflow-wrap:anywhere]">
      {value}
    </dd>
  </div>
);

type StatusCardProps = {
  children: ReactNode;
  className?: string;
  icon: LucideIcon;
  label: string;
};

const StatusCard = ({
  children,
  className,
  icon: Icon,
  label,
}: StatusCardProps) => (
  <div
    className={cn(
      "border-border bg-card text-card-foreground flex flex-col rounded-2xl border p-4 shadow-xs min-[560px]:col-span-3 sm:p-5",
      className,
    )}>
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground text-[11px] leading-tight font-semibold tracking-[0.08em] uppercase">
        {label}
      </span>
      <span className="border-border bg-secondary/60 text-muted-foreground shrink-0 rounded-lg border p-2">
        <Icon
          className="size-4"
          aria-hidden="true"
        />
      </span>
    </div>
    <div className="mt-3 flex flex-1 flex-col">{children}</div>
  </div>
);

const fmtCount = (value: number | undefined) =>
  value === undefined ? "-" : value.toLocaleString("en-IN");

type CheckState = "ok" | "warning" | "failing" | "off" | "unknown";

const stateIcon: Record<CheckState, LucideIcon> = {
  ok: CheckCircle2,
  warning: TriangleAlert,
  failing: TriangleAlert,
  off: CircleOff,
  unknown: HelpCircle,
};

const stateLabel: Record<CheckState, string> = {
  ok: "OK",
  warning: "Warning",
  failing: "Failing",
  off: "Off",
  unknown: "Unknown",
};

const stateTone: Record<CheckState, StatusTone> = {
  ok: "emerald",
  warning: "amber",
  failing: "red",
  off: "neutral",
  unknown: "neutral",
};

const stateDot: Record<CheckState, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  failing: "bg-red-500",
  off: "bg-muted-foreground",
  unknown: "bg-muted-foreground",
};

const StateBadge = ({ state }: { state: CheckState }) => {
  const Icon = stateIcon[state];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1", statusTones[stateTone[state]])}>
      <Icon aria-hidden="true" />
      {stateLabel[state]}
    </Badge>
  );
};

const SystemHealthPage = async () => {
  await requireRole("super_admin");

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const dbStartedAt = new Date().getTime();
  let dbOk = true;
  let dbLatencyMs: number | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = new Date().getTime() - dbStartedAt;
  } catch {
    dbOk = false;
  }

  const dbState: CheckState =
    !dbOk ? "failing"
    : dbLatencyMs !== null && dbLatencyMs > DB_WARN_MS ? "warning"
    : "ok";

  let counts: HealthCounts | null = null;
  let activityAvailable = false;
  let activityRows: AuditActivityRow[] = [];

  if (dbOk) {
    try {
      const [resolvedCounts, resolvedActivity] = await Promise.all([
        loadHealthCounts(now),
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 15,
          select: {
            id: true,
            action: true,
            actorName: true,
            actorEmail: true,
            targetName: true,
            targetEmail: true,
            createdAt: true,
          },
        }),
      ]);
      counts = resolvedCounts;
      activityRows = resolvedActivity;
      activityAvailable = true;
    } catch {
      counts = null;
      activityRows = [];
    }
  }

  const oldestExpiredAgeDays =
    counts?.oldestExpiredAt ?
      (nowMs - counts.oldestExpiredAt.getTime()) / 86_400_000
    : null;

  const sessionWarnExpired =
    counts !== null && counts.expiredSessions > SESSIONS_WARN_EXPIRED;
  const sessionWarnAge =
    oldestExpiredAgeDays !== null &&
    oldestExpiredAgeDays > SESSIONS_WARN_AGE_DAYS;

  const sessionsState: CheckState =
    counts === null ? "unknown"
    : sessionWarnExpired || sessionWarnAge ? "warning"
    : "ok";

  const disk = await loadDiskStats();
  const diskState: CheckState =
    disk === null ? "unknown"
    : disk.usedPct >= DISK_FAIL_PCT ? "failing"
    : disk.usedPct >= DISK_WARN_PCT ? "warning"
    : "ok";

  const productionLocalhost =
    process.env.NODE_ENV === "production" &&
    /localhost|127\.0\.0\.1|\[::1\]/.test(serverEnv.BETTER_AUTH_URL);
  const environmentState: CheckState = productionLocalhost ? "warning" : "ok";

  const lastAuditValue = (() => {
    if (!counts) {
      return "-";
    }
    if (!counts.lastAuditAt) {
      return "No audit entries yet";
    }
    return (
      <RelativeTime
        iso={counts.lastAuditAt.toISOString()}
        nowMs={nowMs}
        className="text-sm font-medium"
      />
    );
  })();

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="flex w-full flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-foreground text-3xl font-bold tracking-tight">
              System Health
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
              Live status of the server and the database.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 sm:gap-4">
            <TooltipProvider delay={150}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <time
                      dateTime={nowIso}
                      tabIndex={0}
                      className="text-muted-foreground decoration-muted-foreground/60 cursor-help text-xs tabular-nums underline decoration-dotted underline-offset-2">
                      Checked at {timeFmt.format(now)}
                    </time>
                  }
                />
                <TooltipContent side="bottom">
                  {dateTimeFmt.format(now)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <RecheckButton />
          </div>
        </header>

        <section
          aria-labelledby="live-checks"
          className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="live-checks"
              className={sectionTitleClass}>
              Live checks
            </h2>
            <TooltipProvider delay={150}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      tabIndex={0}
                      className={cn(
                        "inline-flex cursor-help items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                        statusTones[stateTone[dbState]],
                      )}>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 rounded-full",
                          stateDot[dbState],
                          dbState === "ok" ? "animate-pulse" : "",
                        )}
                      />
                      {dbState === "warning" && dbLatencyMs !== null ?
                        "Database responding slowly"
                      : dbOk && dbLatencyMs !== null ?
                        "Database connected"
                      : "Database unreachable"}
                    </span>
                  }
                />
                <TooltipContent side="top">
                  {dbOk && dbLatencyMs !== null ?
                    `Connected in ${Math.max(1, Math.round(dbLatencyMs))} ms (expected under ${DB_WARN_MS} ms).`
                  : "Could not connect to the database."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-6 sm:gap-4">
            <StatusCard
              icon={KeyRound}
              label="Sessions"
              className="min-[560px]:col-span-2">
              <div className="flex flex-1 flex-col">
                <p className="font-heading text-2xl font-bold tracking-tight tabular-nums">
                  {fmtCount(counts?.activeSessions)}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  Active sessions
                  {counts === null ?
                    ""
                  : `, ${fmtCount(counts.expiredSessions)} expired`}
                </p>
                {sessionsState === "warning" ?
                  <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                    {[
                      sessionWarnExpired ?
                        `${counts?.expiredSessions} expired sessions exceed ${SESSIONS_WARN_EXPIRED}.`
                      : null,
                      sessionWarnAge ?
                        `Oldest expired session is over ${SESSIONS_WARN_AGE_DAYS} days old.`
                      : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                : null}
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <span className="text-muted-foreground text-xs">
                    Oldest expired:{" "}
                    {counts === null ?
                      "-"
                    : counts.oldestExpiredAt === null ?
                      "None"
                    : <RelativeTime
                        iso={counts.oldestExpiredAt.toISOString()}
                        nowMs={nowMs}
                        className="text-xs font-medium"
                      />
                    }
                  </span>
                  <StateBadge state={sessionsState} />
                </div>
              </div>
            </StatusCard>

            <StatusCard
              icon={HardDrive}
              label="Disk"
              className="min-[560px]:col-span-2">
              <div className="flex flex-1 flex-col">
                <p className="font-heading text-2xl font-bold tracking-tight">
                  {disk === null ? "-" : `${disk.usedPct.toFixed(0)}% used`}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {disk === null ?
                    "Could not read the disk usage."
                  : `${formatBytes(disk.freeBytes)} free of ${formatBytes(disk.totalBytes)}.`
                  }
                </p>
                <div
                  role={disk === null ? undefined : "progressbar"}
                  aria-label={disk === null ? undefined : "Disk usage"}
                  aria-valuemin={disk === null ? undefined : 0}
                  aria-valuemax={disk === null ? undefined : 100}
                  aria-valuenow={
                    disk === null ? undefined : Math.round(disk.usedPct)
                  }
                  className="bg-secondary mt-3 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", stateDot[diskState])}
                    style={{
                      width: `${disk === null ? 0 : Math.min(100, Math.max(0, disk.usedPct))}%`,
                    }}
                  />
                </div>
                <div className="mt-auto flex items-center justify-end gap-3 pt-4">
                  <StateBadge state={diskState} />
                </div>
              </div>
            </StatusCard>

            <StatusCard
              icon={Archive}
              label="Backups"
              className="min-[560px]:col-span-2">
              <div className="flex flex-1 flex-col">
                <p className="font-heading text-2xl font-bold tracking-tight">
                  Off
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  Backups are switched off while the system is being built. They
                  will be added before go live.
                </p>
                <div className="mt-auto flex items-center justify-end gap-3 pt-4">
                  <StateBadge state="off" />
                </div>
              </div>
            </StatusCard>

            <StatusCard
              icon={Server}
              label="Environment"
              className="min-[560px]:col-span-6">
              <dl className="flex flex-col">
                <StatusRow
                  label="Health"
                  value={<StateBadge state={environmentState} />}
                />
                <StatusRow
                  label="App"
                  value="Zenith Crown Academy"
                />
                <StatusRow
                  label="Mode"
                  value={
                    <span className="font-mono text-xs">
                      {process.env.NODE_ENV}
                    </span>
                  }
                />
                <StatusRow
                  label="Database path"
                  value={
                    <TooltipProvider delay={150}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="decoration-muted-foreground/60 cursor-help font-mono text-xs underline decoration-dotted underline-offset-2">
                              {serverEnv.DATABASE_URL}
                            </span>
                          }
                        />
                        <TooltipContent side="top">
                          {serverEnv.DATABASE_URL}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  }
                />
                <StatusRow
                  label="Base URL"
                  value={
                    <span className="font-mono text-xs">
                      {serverEnv.BETTER_AUTH_URL}
                    </span>
                  }
                />
                <StatusRow
                  label="Last audit entry"
                  value={lastAuditValue}
                />
              </dl>
              {productionLocalhost ?
                <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                  The live site is configured to use a local address. This needs
                  fixing before students see the system.
                </p>
              : process.env.NODE_ENV === "production" ?
                null
              : <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                  Development mode: this site is expected to use a local
                  address.
                </p>
              }
            </StatusCard>
          </div>
        </section>

        <section
          aria-labelledby="recent-admin-activity"
          className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
            <h2
              id="recent-admin-activity"
              className={sectionTitleClass}>
              Recent admin activity
            </h2>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-muted-foreground text-xs font-medium">
                Last 15 admin actions, newest first
              </p>
              <Link
                href="/dashboard/super-admin/audit-log"
                className="text-foreground inline-flex items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline">
                View full log
                <ArrowRight
                  aria-hidden="true"
                  className="size-3.5"
                />
              </Link>
            </div>
          </div>
          <AuditActivityList
            available={activityAvailable}
            nowIso={nowIso}
            rows={activityRows}
          />
        </section>
      </div>
    </main>
  );
};

export default SystemHealthPage;
