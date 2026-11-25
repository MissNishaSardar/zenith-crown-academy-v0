"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Route } from "next";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";

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

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value === "" ? "—" : value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
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

  const hasFilter = entity !== "user" || action !== "all";
  const prevHref = buildPageHref(
    { action, entity, page: Math.max(1, page - 1) },
    base,
  ) as Route;
  const nextHref = buildPageHref(
    { action, entity, page: Math.min(totalPages, page + 1) },
    base,
  ) as Route;

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Changed fields</TableHead>
            <TableHead aria-label="Details" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ?
            rows.map((row) => {
              const expanded = expandedId === row.id;
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {row.createdAtDisplay}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.entity}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.action}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[220px] truncate">
                    {row.actorEmail ?? "System"}
                    {row.actorRole ? ` · ${row.actorRole}` : null}
                  </TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal">
                    {row.diffs.length > 0 ?
                      <span className="text-muted-foreground text-xs">
                        {row.diffs.map((diff) => diff.field).join(", ")}
                      </span>
                    : <span className="text-muted-foreground text-xs">
                        No field changes
                      </span>
                    }
                  </TableCell>
                  <TableCell>
                    <Button
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      size="sm"
                      type="button"
                      variant="ghost">
                      {expanded ? "Hide" : "Details"}
                    </Button>
                    {expanded ?
                      <div className="mt-2 flex min-w-[280px] flex-col gap-2">
                        {row.diffs.length > 0 ?
                          <ul className="flex flex-col gap-1 text-xs">
                            {row.diffs.map((diff) => (
                              <li
                                className="rounded-md border px-2 py-1"
                                key={diff.field}>
                                <span className="font-semibold">
                                  {diff.field}
                                </span>
                                <span className="text-muted-foreground">
                                  {`: ${formatValue(diff.before)} → ${formatValue(diff.after)}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        : <span className="text-muted-foreground text-xs">
                            No field changes
                          </span>
                        }
                      </div>
                    : null}
                  </TableCell>
                </TableRow>
              );
            })
          : <TableRow>
              <TableCell
                className="h-24 text-center"
                colSpan={6}>
                {hasFilter ?
                  "No audit rows match these filters."
                : "No audit rows yet. User actions will appear here."}
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
