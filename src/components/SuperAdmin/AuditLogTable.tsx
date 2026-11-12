"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  SearchIcon,
  TriangleAlertIcon,
  UserXIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/shadcnui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcnui/select";
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
import { toast } from "@/components/shadcnui/toast";

import { AUDIT_ACTIONS, auditMeta, isAuditAction } from "@/lib/auditSeverity";
import {
  listAuditLogs,
  type AuditLogActionFilter,
  type AuditLogPage,
} from "@/server/auditLog";
import AuditChip from "@/components/SuperAdmin/AuditChip";
import RelativeTime from "@/components/SuperAdmin/RelativeTime";

export type AuditLogInitialFilters = {
  action: AuditLogActionFilter;
  actor: string;
  from: string;
  to: string;
};

const PAGE_SIZE = 10;

const toStartOfDayIso = (dateInput: string): string => {
  const [year, month, day] = dateInput.split("-").map(Number);
  return new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    0,
    0,
    0,
    0,
  ).toISOString();
};

const toEndOfDayIso = (dateInput: string): string => {
  const [year, month, day] = dateInput.split("-").map(Number);
  return new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    23,
    59,
    59,
    999,
  ).toISOString();
};

const emptyState = (
  icon: LucideIcon,
  title: string,
  body: string,
  action?: ReactNode,
) => {
  const Icon = icon;
  return (
    <TableRow>
      <TableCell
        colSpan={4}
        className="h-56">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <Icon
            aria-hidden="true"
            className="text-muted-foreground size-8"
          />
          <p className="font-heading text-base font-semibold">{title}</p>
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
            {body}
          </p>
          {action}
        </div>
      </TableCell>
    </TableRow>
  );
};

type AuditLogTableProps = {
  initialFilters: AuditLogInitialFilters;
  nowIso: string;
};

const AuditLogTable = ({ initialFilters, nowIso }: AuditLogTableProps) => {
  const [action, setAction] = useState<AuditLogActionFilter>(
    initialFilters.action,
  );
  const [actor, setActor] = useState(initialFilters.actor);
  const [debouncedActor, setDebouncedActor] = useState(
    initialFilters.actor.trim(),
  );
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);
  const [pageIndex, setPageIndex] = useState(0);
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const nowMs = useMemo(() => new Date(nowIso).getTime(), [nowIso]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedActor(actor.trim()), 500);
    return () => window.clearTimeout(timer);
  }, [actor]);

  const fromIso = from ? toStartOfDayIso(from) : undefined;
  const toIso = to ? toEndOfDayIso(to) : undefined;

  useEffect(() => {
    let cancelled = false;

    const totalPagesLocal = Math.max(
      1,
      Math.ceil((data?.total ?? 0) / PAGE_SIZE),
    );
    const fetchIndex = Math.min(pageIndex, totalPagesLocal - 1);

    listAuditLogs({
      page: fetchIndex + 1,
      pageSize: PAGE_SIZE,
      action,
      actorSearch: debouncedActor,
      fromIso,
      toIso,
    })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoadFailed(false);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
          toast.add({
            type: "error",
            title: "Could not load audit log",
            description: "Refresh the page to try again.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    action,
    data?.total,
    debouncedActor,
    fromIso,
    pageIndex,
    refreshKey,
    toIso,
  ]);

  const total = data?.total ?? 0;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clampedPageIndex = Math.min(pageIndex, totalPages - 1);
  const showingFrom = total === 0 ? 0 : clampedPageIndex * PAGE_SIZE + 1;
  const showingTo = Math.min(total, (clampedPageIndex + 1) * PAGE_SIZE);
  const filtersActive =
    debouncedActor.length > 0 || action !== "all" || from !== "" || to !== "";

  const resetPage = () => setPageIndex(0);

  const clearFilters = () => {
    setAction("all");
    setActor("");
    setDebouncedActor("");
    setFrom("");
    setTo("");
    setLoading(true);
    resetPage();
  };

  const handleFilterChange = () => {
    setLoading(true);
    resetPage();
  };

  const retryFetch = () => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  const showSkeleton = data === null && !loadFailed;

  return (
    <div className="border-border bg-card flex flex-col overflow-hidden rounded-2xl border shadow-xs">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full max-w-sm">
          <SearchIcon
            aria-hidden="true"
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={actor}
            onChange={(event) => {
              setActor(event.target.value);
              handleFilterChange();
            }}
            placeholder="Search by name or email"
            aria-label="Search by actor name or email"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={action}
            onValueChange={(next) => {
              const value = String(next);
              setAction(
                value === "all" || isAuditAction(value) ? value : "all",
              );
              handleFilterChange();
            }}>
            <SelectTrigger
              aria-label="Filter by action"
              className="w-56">
              <SelectValue>
                {(value: string) =>
                  value === "all" ? "All actions" : auditMeta(value).label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All actions</SelectItem>
                {AUDIT_ACTIONS.map((auditAction) => {
                  const meta = auditMeta(auditAction);
                  const ItemIcon = meta.icon;
                  return (
                    <SelectItem
                      key={auditAction}
                      value={auditAction}>
                      <span className="flex w-full items-center gap-2">
                        <ItemIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        <span className="flex-1">{meta.label}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              handleFilterChange();
            }}
            aria-label="From date"
            className="w-38"
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              handleFilterChange();
            }}
            aria-label="To date"
            className="w-38"
          />
          {filtersActive ?
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearFilters}>
              Clear filters
            </Button>
          : null}
        </div>
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
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ?
              Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell>
                    <Skeleton className="h-5 w-36 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-44" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))
            : loadFailed ?
              emptyState(
                TriangleAlertIcon,
                "Could not load audit log",
                "The audit log could not be loaded. Retry, or refresh the page.",
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={retryFetch}>
                  <RefreshCwIcon
                    aria-hidden="true"
                    className={loading ? "animate-spin" : undefined}
                  />
                  Retry
                </Button>,
              )
            : rows.length === 0 ?
              filtersActive ?
                emptyState(
                  UserXIcon,
                  "No entries match those filters",
                  "Try a different action, search or date range.",
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}>
                    Clear filters
                  </Button>,
                )
              : emptyState(
                  ScrollTextIcon,
                  "No audit entries yet",
                  "Admin actions taken by super admins will be recorded here.",
                )

            : rows.map((row) => {
                const iso = row.createdAtIso;
                const target = row.targetName ?? row.targetEmail ?? "No target";
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <AuditChip
                        action={row.action}
                        details={row.details}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">{row.actorName}</span>
                        <span className="text-muted-foreground max-w-56 truncate text-xs sm:max-w-72">
                          {row.actorEmail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{target}</span>
                    </TableCell>
                    <TableCell>
                      <RelativeTime
                        iso={iso}
                        nowMs={nowMs}
                        className="text-sm"
                      />
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
          {loadFailed ?
            "Could not load audit log"
          : data ?
            `Showing ${showingFrom} to ${showingTo} of ${total} ${
              total === 1 ? "entry" : "entries"
            }`
          : "Loading audit log"}
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
              setPageIndex((current) => Math.min(totalPages - 1, current + 1));
            }}>
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuditLogTable;
