"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Route } from "next";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import { Button } from "@/components/shadcnui/button";
import DataTable, {
  DataTablePagination,
} from "@/components/DataTable/DataTable";
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

const columnHelper = legacyCreateColumnHelper<AuditRow>();

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

  const auditColumns = columnHelper.columns([
    columnHelper.accessor("createdAt", {
      cell: ({ row }) => (
        <span className="text-muted-foreground px-2 py-1.5 whitespace-nowrap">
          <time
            dateTime={row.original.createdAt}
            title={row.original.createdAtDisplay}>
            {getRelativeTime(row.original.createdAt)}
          </time>
        </span>
      ),
      header: "Time",
    }),
    columnHelper.display({
      cell: ({ row }) => {
        const title = getAuditTitle(row.original.entity, row.original.action);
        return (
          <span className="block max-w-[280px] px-2 py-1.5">
            <span className="block truncate text-xs font-semibold">
              {title}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {getAuditEntityLabel(row.original.entity)}
            </span>
          </span>
        );
      },
      header: "Activity",
      id: "activity",
    }),
    columnHelper.accessor("actorEmail", {
      cell: ({ row }) => (
        <span className="text-muted-foreground block max-w-[200px] truncate px-2 py-1.5 text-xs">
          {row.original.actorEmail ?? "System"}
          {row.original.actorRole ? ` · ${row.original.actorRole}` : null}
        </span>
      ),
      header: "Actor",
    }),
    columnHelper.display({
      cell: ({ row }) => (
        <span className="text-muted-foreground block max-w-[260px] truncate px-2 py-1.5 text-xs">
          {getAuditSummary(row.original.diffs)}
        </span>
      ),
      header: "Change",
      id: "change",
    }),
    columnHelper.display({
      cell: ({ row }) => {
        const expanded = expandedId === row.original.id;
        return (
          <span className="block px-2 py-1.5">
            <Button
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation();
                toggleRow(row.original.id);
              }}
              size="sm"
              type="button"
              variant="ghost">
              {expanded ? "Hide" : "Details"}
            </Button>
          </span>
        );
      },
      header: "",
      id: "details",
    }),
  ]);

  const table = useLegacyTable({
    columns: auditColumns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="overflow-hidden rounded-xl border">
      <DataTable
        emptyMessage={
          hasFilter ?
            "No audit rows match these filters."
          : "No audit rows yet. Actions will appear here."
        }
        isRowExpanded={(rowId) => expandedId === rowId}
        minWidthClass="min-w-[720px]"
        onRowToggle={toggleRow}
        renderExpandedRow={(row) => {
          const diffs = row.original.diffs;
          return (
            <span
              className="mt-1.5 flex min-w-[260px] flex-col gap-1 px-2 py-1.5"
              onClick={(event) => event.stopPropagation()}>
              {diffs.length > 0 ?
                <span className="flex flex-col gap-1 text-xs">
                  {diffs.map((diff) => (
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
          );
        }}
        table={table}
      />
      <DataTablePagination
        onNext={() => router.replace(nextHref)}
        onPrevious={() => router.replace(prevHref)}
        page={page}
        pageLabel={`Showing ${rows.length} of ${total} audit rows. Page ${page} of ${totalPages}.`}
        totalPages={totalPages}
      />
    </div>
  );
};

export default AuditList;
