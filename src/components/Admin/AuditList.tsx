"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Route } from "next";
import { Button } from "@/components/shadcnui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";
import {
  formatAuditValue,
  getAuditEntityLabel,
  getAuditFieldLabel,
  getAuditSummary,
  getAuditTitle,
  getRelativeTime,
} from "@/lib/admin/auditPresentation";

export type AuditRowDiff = {
  after: unknown;
  before: unknown;
  field: string;
};

export type AuditRow = {
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  createdAt: string;
  createdAtDisplay: string;
  diffs: AuditRowDiff[];
  entity: string;
  entityId: string | null;
  id: string;
};

type AuditListProps = {
  action: string;
  base: Route;
  entity: string;
  page: number;
  rows: AuditRow[];
  total: number;
  totalPages: number;
};

const buildPageHref = (
  values: { action: string; entity: string; page: number },
  base: Route,
): string => {
  const params = new URLSearchParams();
  if (values.entity !== "user") {
    params.set("entity", values.entity);
  }
  if (values.action !== "all") {
    params.set("action", values.action);
  }
  params.set("page", String(values.page));
  return `${base}?${params.toString()}`;
};

const AuditList = ({
  action,
  base,
  entity,
  page,
  rows,
  total,
  totalPages,
}: AuditListProps) => {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hasFilter = (entity !== "user" && entity !== "all") || action !== "all";
  const prevHref = buildPageHref(
    { action, entity, page: Math.max(1, page - 1) },
    base,
  ) as Route;
  const nextHref = buildPageHref(
    { action, entity, page: Math.min(totalPages, page + 1) },
    base,
  ) as Route;

  const toggleRow = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Change</TableHead>
            <TableHead aria-label="Details" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ?
            rows.map((row) => {
              const expanded = expandedId === row.id;
              const title = getAuditTitle(row.entity, row.action);
              const summary = getAuditSummary(row.diffs);
              return (
                <TableRow
                  className="hover:bg-muted/40 cursor-pointer"
                  key={row.id}
                  onClick={() => toggleRow(row.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleRow(row.id);
                    }
                  }}
                  tabIndex={0}>
                  <TableCell className="text-muted-foreground px-2 py-1.5 whitespace-nowrap">
                    <time
                      dateTime={row.createdAt}
                      title={row.createdAtDisplay}>
                      {getRelativeTime(row.createdAt)}
                    </time>
                  </TableCell>
                  <TableCell className="max-w-[280px] px-2 py-1.5">
                    <span className="block truncate text-xs font-semibold">
                      {title}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {getAuditEntityLabel(row.entity)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate px-2 py-1.5 text-xs">
                    {row.actorEmail ?? "System"}
                    {row.actorRole ? ` · ${row.actorRole}` : null}
                  </TableCell>
                  <TableCell className="max-w-[260px] px-2 py-1.5">
                    <span className="text-muted-foreground block truncate text-xs">
                      {summary}
                    </span>
                    {expanded ?
                      <span
                        className="mt-1.5 flex min-w-[260px] flex-col gap-1"
                        onClick={(event) => event.stopPropagation()}>
                        {row.diffs.length > 0 ?
                          <span className="flex flex-col gap-1 text-xs">
                            {row.diffs.map((diff) => (
                              <span
                                className="rounded-md border px-2 py-1"
                                key={diff.field}>
                                <span className="font-semibold">
                                  {getAuditFieldLabel(diff.field)}
                                </span>
                                <span className="text-muted-foreground">
                                  {`: ${formatAuditValue(diff.before)} to ${formatAuditValue(diff.after)}`}
                                </span>
                              </span>
                            ))}
                          </span>
                        : <span className="text-muted-foreground text-xs">
                            No field changes
                          </span>
                        }
                      </span>
                    : null}
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <Button
                      aria-expanded={expanded}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleRow(row.id);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost">
                      {expanded ? "Hide" : "Details"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          : <TableRow>
              <TableCell
                className="h-24 text-center"
                colSpan={5}>
                {hasFilter ?
                  "No audit rows match these filters."
                : "No audit rows yet. Actions will appear here."}
              </TableCell>
            </TableRow>
          }
        </TableBody>
      </Table>
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Showing {rows.length} of {total} audit rows. Page {page} of{" "}
          {totalPages}.
        </p>
        <div className="flex items-center gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => router.replace(prevHref)}
            size="sm"
            type="button"
            variant="outline">
            Previous
          </Button>
          <Button
            disabled={page >= totalPages}
            onClick={() => router.replace(nextHref)}
            size="sm"
            type="button"
            variant="outline">
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuditList;
