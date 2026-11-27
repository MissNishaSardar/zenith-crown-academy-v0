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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";
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
import { Progress } from "@/components/shadcnui/progress";
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

type MemoryState = {
  badge: ReactNode;
  indicatorClass: string;
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
      indicatorClass: "[&_[data-slot=progress-indicator]]:bg-destructive",
      percent: null,
    };
  }
  if (used === null || total === null || total <= 0) {
    return {
      badge: <Badge variant="destructive">Not measured</Badge>,
      indicatorClass: "[&_[data-slot=progress-indicator]]:bg-destructive",
      percent: null,
    };
  }
  const percent = Math.min(100, Math.round((used / total) * 100));
  if (percent >= 90) {
    return {
      badge: <Badge variant="destructive">Critical</Badge>,
      indicatorClass: "[&_[data-slot=progress-indicator]]:bg-destructive",
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
      indicatorClass: "[&_[data-slot=progress-indicator]]:bg-amber-500",
      percent,
    };
  }
  return {
    badge: (
      <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        Normal
      </Badge>
    ),
    indicatorClass: "[&_[data-slot=progress-indicator]]:bg-emerald-500",
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

  const isOk = snapshot.status === "ok";
  const checkedDisplay = formatDateTimeDisplay(snapshot.timestamp);
  const memory = getMemoryState(
    snapshot.runtime.memoryMb,
    snapshot.runtime.memoryTotalMb,
    snapshot.runtime.ok,
  );

  const StatusIcon = isOk ? CircleCheckIcon : TriangleAlertIcon;

  return (
    <div className="flex flex-col gap-4">
      <Card
        aria-label="Overall system status"
        className="flex-col gap-4 p-4 sm:p-5"
        role="region">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={
                isOk ?
                  "flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-full"
              }>
              <StatusIcon className="size-5" />
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
              <CardTitle className="text-foreground text-lg font-semibold text-balance">
                {isOk ? "Everything looks good" : "Something needs attention"}
              </CardTitle>
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
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          aria-label="Classes and logins"
          className="h-60 flex-col gap-3 p-4"
          role="region">
          <CardHeader className="p-0">
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                  <DatabaseIcon className="size-4" />
                </span>
                <div className="flex flex-col">
                  <CardTitle>Classes and logins</CardTitle>
                  <p className="text-muted-foreground text-xs">
                    Student records and sign in
                  </p>
                </div>
              </div>
              {snapshot.database.ok ?
                <Badge>Working</Badge>
              : <Badge variant="destructive">Needs attention</Badge>}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-1 p-0">
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
          </CardContent>
        </Card>

        <Card
          aria-label="Files and uploads"
          className="h-60 flex-col gap-3 p-4"
          role="region">
          <CardHeader className="p-0">
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                  <HardDriveIcon className="size-4" />
                </span>
                <div className="flex flex-col">
                  <CardTitle>Files and uploads</CardTitle>
                  <p className="text-muted-foreground text-xs">
                    Worksheets and images
                  </p>
                </div>
              </div>
              {snapshot.storage.ok ?
                <Badge>Ready</Badge>
              : <Badge variant="destructive">Not ready</Badge>}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-1 p-0">
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
          </CardContent>
        </Card>

        <Card
          aria-label="Setup and keys"
          className="h-60 flex-col gap-3 p-4"
          role="region">
          <CardHeader className="p-0">
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                  <ShieldCheckIcon className="size-4" />
                </span>
                <div className="flex flex-col">
                  <CardTitle>Setup and keys</CardTitle>
                  <p className="text-muted-foreground text-xs">
                    Private app settings
                  </p>
                </div>
              </div>
              {snapshot.env.ok ?
                <Badge>Complete</Badge>
              : <Badge variant="destructive">Missing keys</Badge>}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-1 p-0">
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
          </CardContent>
        </Card>

        <Card
          aria-label="Server awake time"
          className="h-60 flex-col gap-3 p-4"
          role="region">
          <CardHeader className="p-0">
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                  <ActivityIcon className="size-4" />
                </span>
                <div className="flex flex-col">
                  <CardTitle>Server awake time</CardTitle>
                  <p className="text-muted-foreground text-xs">
                    Memory and run time
                  </p>
                </div>
              </div>
              {memory.badge}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-1 p-0">
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
              <Progress
                aria-label={`Memory use ${memory.percent} percent`}
                className={memory.indicatorClass}
                value={memory.percent}
              />
            : null}
            <div className="mt-auto pt-1">
              <HealthDetailsDialog
                title="Server awake time"
                subtitle="Memory and run time"
                meaning="A short awake time after an update is normal. Memory changes through the day."
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SystemHealthView;
