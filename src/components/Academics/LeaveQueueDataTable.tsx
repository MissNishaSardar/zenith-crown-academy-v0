"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { SortingState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  legacyCreateColumnHelper,
  useLegacyTable,
} from "@tanstack/react-table/legacy";
import type { Route } from "next";
import { Loader2Icon } from "lucide-react";

import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";

export type LeaveQueueRow = {
  createdAt: string;
  endDate: string;
  id: string;
  reason: string;
  startDate: string;
  status: string;
  target: string;
  targetName: string;
};

type LeaveQueueDataTableProps = {
  actingId: string | null;
  canDecide: boolean;
  dir: string;
  onDecide: (id: string, decision: "APPROVE" | "REJECT") => void;
  page: number;
  pageSize: number;
  rows: LeaveQueueRow[];
  sort: string;
  sorting: SortingState;
  total: number;
  totalPages: number;
};

const columnHelper = legacyCreateColumnHelper<LeaveQueueRow>();

const LeaveQueueDataTable = ({
  actingId,
  canDecide,
  dir,
  onDecide,
  page,
  pageSize,
  rows,
  sort,
  sorting,
  total,
  totalPages,
}: LeaveQueueDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staffDate = searchParams.get("date") ?? "";

  const buildHref = (nextPage: number, nextSort = sort, nextDir = dir) => {
    const params = new URLSearchParams();
    if (staffDate) params.set("date", staffDate);
    if (nextSort !== "createdAt" || nextDir !== "desc") {
      params.set("sort", nextSort);
      params.set("dir", nextDir);
    }
    params.set("page", String(nextPage));
    return `${pathname}?${params.toString()}` as Route;
  };

  const columns = columnHelper.columns([
    columnHelper.accessor("targetName", {
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      enableSorting: false,
      header: "Name",
      id: "targetName",
    }),
    columnHelper.accessor("startDate", {
      cell: ({ getValue }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {getValue()}
        </span>
      ),
      header: ({ column }) => (
        <DataTableSortButton
          column={column}
          label="Starts"
        />
      ),
    }),
    columnHelper.accessor("endDate", {
      cell: ({ getValue }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {getValue()}
        </span>
      ),
      enableSorting: false,
      header: "Ends",
    }),
    columnHelper.accessor("status", {
      cell: ({ getValue }) => (
        <Badge
          variant="secondary"
          className="w-fit whitespace-nowrap">
          {getValue()}
        </Badge>
      ),
      header: ({ column }) => (
        <DataTableSortButton
          column={column}
          label="Status"
        />
      ),
    }),
    columnHelper.display({
      cell: ({ row }) => {
        const leave = row.original;
        const busy = actingId === leave.id;
        const disabled = !canDecide || leave.status !== "PENDING" || busy;
        return (
          <span className="flex gap-2">
            <Button
              disabled={disabled}
              onClick={() => onDecide(leave.id, "APPROVE")}
              size="sm"
              type="button"
              variant="outline">
              {busy ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Working
                </>
              : "Approve"}
            </Button>
            <Button
              disabled={disabled}
              onClick={() => onDecide(leave.id, "REJECT")}
              size="sm"
              type="button"
              variant="ghost">
              Reject
            </Button>
          </span>
        );
      },
      enableSorting: false,
      header: "",
      id: "actions",
    }),
  ]);

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const current = [{ desc: dir === "desc", id: sort }];
      const next = typeof updater === "function" ? updater(current) : updater;
      const first = next[0];
      if (first) {
        router.replace(buildHref(1, first.id, first.desc ? "desc" : "asc"));
      } else {
        router.replace(buildHref(1, "createdAt", "desc"));
      }
    },
    pageCount: totalPages,
    state: {
      pagination: { pageIndex: page - 1, pageSize },
      sorting,
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border">
      <DataTable
        emptyMessage="No leave requests in scope."
        minWidthClass="min-w-[720px]"
        table={table}
      />
      <DataTablePagination
        onNext={() => router.replace(buildHref(Math.min(totalPages, page + 1)))}
        onPrevious={() => router.replace(buildHref(Math.max(1, page - 1)))}
        page={page}
        pageLabel={`Showing ${rows.length} of ${total} requests. Page ${page} of ${totalPages}.`}
        totalPages={totalPages}
      />
    </div>
  );
};

export default LeaveQueueDataTable;
