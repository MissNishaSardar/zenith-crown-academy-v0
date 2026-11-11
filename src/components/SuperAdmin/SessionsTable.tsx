"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  LoaderIcon,
  LogOutIcon,
  MonitorSmartphoneIcon,
  MoreHorizontalIcon,
  SearchIcon,
  UserXIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcnui/dropdown-menu";
import { Input } from "@/components/shadcnui/input";
import { Skeleton } from "@/components/shadcnui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcnui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcnui/tooltip";
import { toast } from "@/components/shadcnui/toast";

import { authClient } from "@/lib/auth-client";
import { MIN_LOAD_MS } from "@/lib/auth/withMinimumLoad";
import { parseRoleNames, roleLabels } from "@/lib/auth/permissions";
import { logAudit } from "@/server/audit";
import {
  listAdminSessions,
  type AdminSessionRow,
  type AdminSessionStatus,
  type AdminSessionsPage,
} from "@/server/sessions";
import ConfirmDialog from "@/components/SuperAdmin/ConfirmDialog";

const PAGE_SIZE = 10;

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});
const relativeTimeFmt = new Intl.RelativeTimeFormat("en-IN", {
  numeric: "auto",
});

const relativeTime = (iso: string, nowMs: number): string => {
  const diffMs = new Date(iso).getTime() - nowMs;
  const sign = diffMs < 0 ? -1 : 1;
  const abs = Math.abs(diffMs);
  if (abs < 60_000) {
    return diffMs < 0 ? "under a minute ago" : "in under a minute";
  }
  if (abs < 3_600_000) {
    return relativeTimeFmt.format(sign * Math.floor(abs / 60_000), "minute");
  }
  if (abs < 86_400_000) {
    return relativeTimeFmt.format(sign * Math.floor(abs / 3_600_000), "hour");
  }
  if (abs < 30 * 86_400_000) {
    return relativeTimeFmt.format(sign * Math.floor(abs / 86_400_000), "day");
  }
  if (abs < 365 * 86_400_000) {
    return relativeTimeFmt.format(
      sign * Math.floor(abs / (30 * 86_400_000)),
      "month",
    );
  }
  return relativeTimeFmt.format(
    sign * Math.floor(abs / (365 * 86_400_000)),
    "year",
  );
};

const deviceLabel = (userAgent: string | null): string => {
  if (!userAgent) {
    return "Unknown device";
  }
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /OPR\/|Opera/.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : "Browser";
  const os =
    /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
    : /Mac OS X|Macintosh/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "Unknown OS";
  return `${browser} on ${os}`;
};

type ActionItemProps = {
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  reason?: string | undefined;
  destructive?: boolean;
};

const ActionItem = ({
  destructive = false,
  disabled,
  icon: Icon,
  label,
  onSelect,
  reason,
}: ActionItemProps) => {
  const item = (
    <DropdownMenuItem
      variant={destructive ? "destructive" : "default"}
      disabled={disabled}
      onClick={onSelect}>
      <Icon aria-hidden="true" />
      {label}
    </DropdownMenuItem>
  );
  if (!disabled) {
    return item;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="block"
            tabIndex={0}>
            {item}
          </span>
        }
      />
      <TooltipContent side="left">{reason ?? "Not available"}</TooltipContent>
    </Tooltip>
  );
};

type SessionsTableProps = {
  currentToken: string;
  initialStatus: AdminSessionStatus;
  nowIso: string;
  selfId: string;
};

type ConfirmTarget = {
  kind: "single" | "all";
  row: AdminSessionRow;
};

const SessionsTable = ({
  currentToken,
  initialStatus,
  nowIso,
  selfId,
}: SessionsTableProps) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<AdminSessionStatus>(initialStatus);
  const [pageIndex, setPageIndex] = useState(0);
  const [data, setData] = useState<AdminSessionsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(
    null,
  );
  const [confirmBusy, setConfirmBusy] = useState(false);
  const nowMs = useMemo(() => new Date(nowIso).getTime(), [nowIso]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    const totalPagesLocal = Math.max(
      1,
      Math.ceil((data?.total ?? 0) / PAGE_SIZE),
    );
    const fetchIndex = Math.min(pageIndex, totalPagesLocal - 1);

    listAdminSessions({
      page: fetchIndex + 1,
      pageSize: PAGE_SIZE,
      search: debouncedSearch,
      status,
    })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          toast.add({
            type: "error",
            title: "Could not load sessions",
            description: "Refresh the page to try again.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data?.total, debouncedSearch, pageIndex, refreshKey, status]);

  const total = data?.total ?? 0;
  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clampedPageIndex = Math.min(pageIndex, totalPages - 1);
  const showingFrom = total === 0 ? 0 : clampedPageIndex * PAGE_SIZE + 1;
  const showingTo = Math.min(total, (clampedPageIndex + 1) * PAGE_SIZE);
  const filtersActive = debouncedSearch.length > 0 || status !== "all";

  const refreshList = () => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  const resetPage = () => setPageIndex(0);

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("all");
    setLoading(true);
    resetPage();
  };

  const onConfirm = async () => {
    if (!confirmTarget) {
      return;
    }
    const target = confirmTarget;
    setConfirmBusy(true);
    const startedAt = Date.now();
    try {
      const { error } =
        target.kind === "single" ?
          await authClient.admin.revokeUserSession({
            sessionToken: target.row.token,
          })
        : await authClient.admin.revokeUserSessions({
            userId: target.row.userId,
          });

      if (error) {
        toast.add({
          type: "error",
          title: "Action failed",
          description: error.message || "Please try again.",
        });
        return;
      }

      try {
        await logAudit({
          action:
            target.kind === "single" ? "session.revoke" : "session.revoke_all",
          target: {
            userId: target.row.userId,
            name: target.row.userName,
            email: target.row.userEmail,
          },
          details:
            target.kind === "single" ?
              { sessionId: target.row.id, expired: target.row.expired }
            : {},
        });
      } catch {
        toast.add({
          type: "warning",
          title: "Audit entry failed",
          description:
            "The action was applied but the audit trail was not updated.",
        });
      }

      toast.add({
        type: "success",
        title:
          target.kind === "single" ? "Session revoked" : "Sessions revoked",
        description:
          target.kind === "single" ?
            `${target.row.userName} was signed out on that device.`
          : `${target.row.userName} was signed out on every device.`,
      });
      setConfirmTarget(null);
      refreshList();
    } catch {
      toast.add({
        type: "error",
        title: "Action failed",
        description: "Something went wrong. Please try again.",
      });
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOAD_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, MIN_LOAD_MS - elapsed),
        );
      }
      setConfirmBusy(false);
    }
  };

  const showSkeleton = data === null;

  return (
    <TooltipProvider delay={150}>
      <div className="border-border bg-card flex flex-col overflow-hidden rounded-2xl border shadow-xs">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <SearchIcon
              aria-hidden="true"
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLoading(true);
                resetPage();
              }}
              placeholder="Search by name or email"
              aria-label="Search sessions"
              className="pl-9"
            />
          </div>
          <ToggleGroup
            value={[status]}
            onValueChange={(values: string[]) => {
              const next = values.at(-1);
              if (next === "all" || next === "active" || next === "expired") {
                setStatus(next);
                setLoading(true);
                resetPage();
              }
            }}
            spacing={0}
            variant="outline"
            size="sm"
            aria-label="Filter sessions">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="active">Active</ToggleGroupItem>
            <ToggleGroupItem value="expired">Expired</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Table */}
        <div
          className={
            loading && data ?
              "opacity-60 transition-opacity"
            : "transition-opacity"
          }
          aria-busy={loading}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>IP address</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Row actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showSkeleton ?
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto size-8 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              : sessions.length === 0 ?
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-56">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      {filtersActive ?
                        <>
                          <UserXIcon
                            aria-hidden="true"
                            className="text-muted-foreground size-8"
                          />
                          <p className="font-heading text-base font-semibold">
                            No sessions match those filters
                          </p>
                          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                            Try a different search, or switch the status filter
                            back to All.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={clearFilters}>
                            Clear filters
                          </Button>
                        </>
                      : <>
                          <KeyRoundIcon
                            aria-hidden="true"
                            className="text-muted-foreground size-8"
                          />
                          <p className="font-heading text-base font-semibold">
                            No sessions yet
                          </p>
                          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                            Sessions appear here as soon as someone signs in.
                          </p>
                        </>
                      }
                    </div>
                  </TableCell>
                </TableRow>
              : sessions.map((row) => {
                  const isCurrentDevice = row.token === currentToken;
                  const isOwnRow = row.userId === selfId;
                  const device = deviceLabel(row.userAgent);
                  const hasFlags =
                    row.expired ||
                    row.impersonatedBy !== null ||
                    isCurrentDevice;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium">{row.userName}</span>
                          <span className="text-muted-foreground max-w-56 truncate text-xs sm:max-w-72">
                            {row.userEmail}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {parseRoleNames(row.userRole).map((roleName) => (
                            <Badge
                              key={roleName}
                              variant="secondary">
                              {roleLabels[roleName]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.userAgent ?
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="cursor-help">{device}</span>
                              }
                            />
                            <TooltipContent
                              side="top"
                              className="max-w-xs break-words">
                              {row.userAgent}
                            </TooltipContent>
                          </Tooltip>
                        : <span className="text-muted-foreground text-sm">
                            Unknown device
                          </span>
                        }
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm tabular-nums">
                        {row.ipAddress ?
                          <span
                            title={row.ipAddress}
                            className="block max-w-40 truncate">
                            {row.ipAddress}
                          </span>
                        : "Unknown"}
                      </TableCell>
                      <TableCell>
                        <span
                          title={dateTimeFmt.format(new Date(row.createdAtIso))}
                          className="text-muted-foreground text-sm tabular-nums">
                          {dateFmt.format(new Date(row.createdAtIso))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          title={dateTimeFmt.format(new Date(row.expiresAtIso))}
                          className="text-muted-foreground text-sm tabular-nums">
                          {relativeTime(row.expiresAtIso, nowMs)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {hasFlags ?
                          <div className="flex flex-wrap gap-1">
                            {row.expired ?
                              <Badge variant="destructive">Expired</Badge>
                            : null}
                            {row.impersonatedBy ?
                              <Badge variant="secondary">Impersonated</Badge>
                            : null}
                            {isCurrentDevice ?
                              <Badge variant="outline">This device</Badge>
                            : null}
                          </div>
                        : <span className="text-muted-foreground text-sm">
                            None
                          </span>
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${row.userName}`}
                              />
                            }>
                            <MoreHorizontalIcon aria-hidden="true" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-52">
                            <ActionItem
                              icon={LogOutIcon}
                              label="Revoke session"
                              destructive
                              disabled={isCurrentDevice}
                              reason="You cannot revoke the session you are currently using."
                              onSelect={() =>
                                setConfirmTarget({ kind: "single", row })
                              }
                            />
                            <ActionItem
                              icon={MonitorSmartphoneIcon}
                              label="Revoke all sessions"
                              destructive
                              disabled={isOwnRow}
                              reason="You cannot revoke every session of your own account here."
                              onSelect={() =>
                                setConfirmTarget({ kind: "all", row })
                              }
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              }
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="text-muted-foreground flex items-center gap-2">
            {data ?
              `Showing ${showingFrom} to ${showingTo} of ${total} ${
                total === 1 ? "session" : "sessions"
              }`
            : "Loading sessions"}
            {loading ?
              <LoaderIcon
                aria-hidden="true"
                className="size-3.5 animate-spin"
              />
            : null}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground mr-1 tabular-nums">
              Page {clampedPageIndex + 1} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={clampedPageIndex <= 0}
              onClick={() => {
                setLoading(true);
                setPageIndex((current) => Math.max(0, current - 1));
              }}>
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={clampedPageIndex >= totalPages - 1}
              onClick={() => {
                setLoading(true);
                setPageIndex((current) =>
                  Math.min(totalPages - 1, current + 1),
                );
              }}>
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
          }
        }}
        busy={confirmBusy}
        destructive
        title={
          confirmTarget?.kind === "all" ?
            `Revoke all sessions for ${confirmTarget.row.userName}?`
          : "Revoke this session?"
        }
        description={
          confirmTarget?.kind === "all" ?
            `${confirmTarget.row.userName} will be signed out on every device, including active sessions. They can sign in again with their credentials.`
          : `${confirmTarget?.row.userName ?? "This user"} will be signed out on ${confirmTarget ? deviceLabel(confirmTarget.row.userAgent) : "that device"}. This takes effect immediately.`
        }
        confirmLabel={
          confirmTarget?.kind === "all" ? "Revoke all" : "Revoke session"
        }
        onConfirm={() => void onConfirm()}
      />
    </TooltipProvider>
  );
};

export default SessionsTable;
