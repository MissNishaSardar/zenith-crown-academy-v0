"use client";

import {
  ActivityIcon,
  CircleCheckIcon,
  DatabaseIcon,
  HardDriveIcon,
  InfoIcon,
  Loader2Icon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcnui/dialog";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { formatDateTimeDisplay } from "@/lib/formatDate";
import type { HealthSnapshot } from "@/server/system/health";

type SystemHealthViewProps = {
  snapshot: HealthSnapshot;
};

const formatSpeed = (value: number | null): string => {
  if (value === null) {
    return "Not measured yet";
  }
  if (value < 300) {
    return `Fast at ${value} ms`;
  }
  if (value < 800) {
    return `Okay at ${value} ms`;
  }
  return `Slow at ${value} ms`;
};

const formatCount = (value: number | null): string => {
  if (value === null) {
    return "Not counted yet";
  }
  return `${value}`;
};

const formatMemory = (used: number | null, total: number | null): string => {
  if (used === null || total === null) {
    return "Not measured yet";
  }
  return `${used} MB of ${total} MB`;
};

const formatUptime = (totalSeconds: number): string => {
  if (totalSeconds < 60) {
    return `${totalSeconds} seconds`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes > 0 ?
        `${hours} hours ${restMinutes} minutes`
      : `${hours} hours`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} days ${restHours} hours` : `${days} days`;
};

const formatCheckedAt = (iso: string): string => formatDateTimeDisplay(iso);

type MemoryState = {
  badge: ReactNode;
  barClass: string;
  percent: number | null;
};

const getMemoryState = (
  used: number | null,
  total: number | null,
  ok: boolean,
): MemoryState => {
  if (!ok) {
    return {
      badge: <Badge variant="destructive">Not measured</Badge>,
      barClass: "bg-destructive",
      percent: null,
    };
  }
  if (used === null || total === null || total <= 0) {
    return {
      badge: <Badge variant="destructive">Not measured</Badge>,
      barClass: "bg-destructive",
      percent: null,
    };
  }
  const percent = Math.min(100, Math.round((used / total) * 100));
  if (percent >= 90) {
    return {
      badge: <Badge variant="destructive">Critical</Badge>,
      barClass: "bg-destructive",
      percent,
    };
  }
  if (percent >= 70) {
    return {
      badge: (
        <Badge className="border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300">
          High
        </Badge>
      ),
      barClass: "bg-amber-500",
      percent,
    };
  }
  return {
    badge: (
      <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        Normal
      </Badge>
    ),
    barClass: "bg-emerald-500",
    percent,
  };
};

type HealthDetailsDialogProps = {
  meaning: string;
  subtitle: string;
  title: string;
};

const HealthDetailsDialog = ({
  meaning,
  subtitle,
  title,
}: HealthDetailsDialogProps) => {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className="w-full justify-start"
            size="sm"
            type="button"
            variant="outline"
          />
        }>
        <InfoIcon
          aria-hidden="true"
          data-icon="inline-start"
        />
        View details
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {meaning}
        </p>
      </DialogContent>
    </Dialog>
  );
};

const SystemHealthView = ({ snapshot }: SystemHealthViewProps) => {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    await withMinimumLoad(Promise.resolve());
    router.refresh();
    setIsRefreshing(false);
  };

  const checks = [
    snapshot.database.ok,
    snapshot.storage.ok,
    snapshot.env.ok,
    snapshot.runtime.ok,
  ];
  const workingCount = checks.filter(Boolean).length;
  const isOk = snapshot.status === "ok";
  const checkedDisplay = formatCheckedAt(snapshot.timestamp);
  const memory = getMemoryState(
    snapshot.runtime.memoryMb,
    snapshot.runtime.memoryTotalMb,
    snapshot.runtime.ok,
  );

  const StatusHeroIcon = isOk ? CircleCheckIcon : TriangleAlertIcon;

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Overall system status"
        className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={
                isOk ?
                  "flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-full"
              }>
              <StatusHeroIcon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                System status
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {isOk ?
                  <Badge>All working</Badge>
                : <Badge variant="destructive">Needs attention</Badge>}
                <Badge variant="outline">Version {snapshot.version}</Badge>
              </div>
              <h2 className="text-foreground text-lg font-semibold text-balance">
                {isOk ? "Everything looks good" : "Something needs attention"}
              </h2>
              <p
                aria-live="polite"
                className="text-muted-foreground text-sm text-pretty">
                {isOk ?
                  "All 4 systems are working. Teaching and office work can continue."
                : `${workingCount} of 4 systems are working. Read the cards below to see what to check first.`
                }
              </p>
              <p
                className="text-muted-foreground text-[13px] leading-relaxed"
                suppressHydrationWarning>
                Checked {checkedDisplay}. Times use your device clock.
              </p>
            </div>
          </div>
          <Button
            className="w-full sm:w-auto"
            disabled={isRefreshing}
            onClick={handleRefresh}
            size="sm"
            type="button"
            variant="outline">
            {isRefreshing ?
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                />
                Refreshing
              </>
            : <>
                <RefreshCwIcon aria-hidden="true" />
                Refresh
              </>
            }
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section
          aria-label="Classes and logins"
          className="bg-card flex h-60 flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                <DatabaseIcon className="size-4" />
              </span>
              <div className="flex flex-col">
                <h3 className="font-medium">Classes and logins</h3>
                <p className="text-muted-foreground text-xs">
                  Student records and sign in
                </p>
              </div>
            </div>
            {snapshot.database.ok ?
              <Badge>Working</Badge>
            : <Badge variant="destructive">Needs attention</Badge>}
          </div>
          <dl className="flex flex-1 flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Speed</dt>
              <dd className="text-foreground font-medium">
                {formatSpeed(snapshot.database.latencyMs)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">People records</dt>
              <dd className="text-foreground font-medium">
                {formatCount(snapshot.database.userCount)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Active logins</dt>
              <dd className="text-foreground font-medium">
                {formatCount(snapshot.database.sessionCount)}
              </dd>
            </div>
          </dl>
          <div className="mt-auto pt-1">
            <HealthDetailsDialog
              title="Classes and logins"
              subtitle="Student records and sign in"
              meaning="When this is working, everyone can sign in and open class pages."
            />
          </div>
        </section>

        <section
          aria-label="Files and uploads"
          className="bg-card flex h-60 flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                <HardDriveIcon className="size-4" />
              </span>
              <div className="flex flex-col">
                <h3 className="font-medium">Files and uploads</h3>
                <p className="text-muted-foreground text-xs">
                  Worksheets and images
                </p>
              </div>
            </div>
            {snapshot.storage.ok ?
              <Badge>Ready</Badge>
            : <Badge variant="destructive">Not ready</Badge>}
          </div>
          <dl className="flex flex-1 flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Upload space</dt>
              <dd className="text-foreground font-medium">
                {snapshot.storage.ok ?
                  "Ready to save files"
                : "Cannot save files"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Folder</dt>
              <dd className="text-foreground font-medium">Public uploads</dd>
            </div>
          </dl>
          <div className="mt-auto pt-1">
            <HealthDetailsDialog
              title="Files and uploads"
              subtitle="Worksheets and images"
              meaning="When this is ready, file uploads will save without errors."
            />
          </div>
        </section>

        <section
          aria-label="Setup and keys"
          className="bg-card flex h-60 flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                <ShieldCheckIcon className="size-4" />
              </span>
              <div className="flex flex-col">
                <h3 className="font-medium">Setup and keys</h3>
                <p className="text-muted-foreground text-xs">
                  Private app settings
                </p>
              </div>
            </div>
            {snapshot.env.ok ?
              <Badge>Complete</Badge>
            : <Badge variant="destructive">Missing keys</Badge>}
          </div>
          <dl className="flex flex-1 flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Main database</dt>
              <dd>
                {snapshot.env.databaseUrlSet ?
                  <Badge variant="outline">Set</Badge>
                : <Badge variant="destructive">Missing</Badge>}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Login address</dt>
              <dd>
                {snapshot.env.betterAuthUrlSet ?
                  <Badge variant="outline">Set</Badge>
                : <Badge variant="destructive">Missing</Badge>}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Login secret</dt>
              <dd>
                {snapshot.env.betterAuthSecretSet ?
                  <Badge variant="outline">Set</Badge>
                : <Badge variant="destructive">Missing</Badge>}
              </dd>
            </div>
          </dl>
          <div className="mt-auto pt-1">
            <HealthDetailsDialog
              title="Setup and keys"
              subtitle="Private app settings"
              meaning="Keys stay hidden. This page only shows if each key is present."
            />
          </div>
        </section>

        <section
          aria-label="Server awake time"
          className="bg-card flex h-60 flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                <ActivityIcon className="size-4" />
              </span>
              <div className="flex flex-col">
                <h3 className="font-medium">Server awake time</h3>
                <p className="text-muted-foreground text-xs">
                  Memory and run time
                </p>
              </div>
            </div>
            {memory.badge}
          </div>
          <dl className="flex flex-1 flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Awake for</dt>
              <dd className="text-foreground font-medium">
                {formatUptime(snapshot.runtime.uptimeSec)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Memory</dt>
              <dd className="text-foreground font-medium">
                {formatMemory(
                  snapshot.runtime.memoryMb,
                  snapshot.runtime.memoryTotalMb,
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-foreground font-medium">
                {snapshot.runtime.ok ? "Running normally" : "Not available"}
              </dd>
            </div>
          </dl>
          {memory.percent !== null ?
            <div
              aria-label={`Memory use ${memory.percent} percent`}
              className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={memory.percent}>
              <div
                className={`h-full rounded-full ${memory.barClass}`}
                style={{ width: `${memory.percent}%` }}
              />
            </div>
          : null}
          <div className="mt-auto pt-1">
            <HealthDetailsDialog
              title="Server awake time"
              subtitle="Memory and run time"
              meaning="A short awake time after an update is normal. Memory changes through the day."
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default SystemHealthView;
