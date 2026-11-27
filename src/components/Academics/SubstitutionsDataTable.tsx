"use client";

import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type { Route } from "next";
import { useState } from "react";

import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  applySubstitutionApproval,
  decideSubstitutionApproval,
} from "@/server/academics/timetableActions";

export type SubstitutionRow = {
  coverName: string;
  date: string;
  id: string;
  reason: string;
  slotLabel: string;
  status: string;
};

type SubstitutionsDataTableProps = {
  dir: string;
  page: number;
  rows: SubstitutionRow[];
  sort: string;
  total: number;
  totalPages: number;
};

const substitutionHelper = legacyCreateColumnHelper<SubstitutionRow>();

const substitutionColumns = substitutionHelper.columns([
  substitutionHelper.accessor("date", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Date"
      />
    ),
  }),
  substitutionHelper.accessor("slotLabel", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Slot",
  }),
  substitutionHelper.accessor("coverName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Cover",
  }),
  substitutionHelper.accessor("status", {
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
]);

const SubstitutionsDataTable = ({
  dir,
  page,
  rows,
  sort,
  total,
  totalPages,
}: SubstitutionsDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const table = useLegacyTable({
    columns: substitutionColumns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const current = [{ desc: dir === "desc", id: sort }];
      const next = typeof updater === "function" ? updater(current) : updater;
      const first = next[0];
      const params = new URLSearchParams(window.location.search);
      if (first) {
        params.set("sort", first.id);
        params.set("dir", first.desc ? "desc" : "asc");
      }
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    },
    pageCount: totalPages,
    state: {
      pagination: { pageIndex: page - 1, pageSize: 10 },
      sorting: [{ desc: dir === "desc", id: sort }],
    },
  });

  const goPage = (nextPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}` as Route);
  };

  const onDecide = async (id: string, decision: "APPROVE" | "REJECT") => {
    setMessage(null);
    setActingId(id);
    try {
      const decideResult = await withMinimumLoad(
        decideSubstitutionApproval({ decision, id }),
      );
      if (!decideResult.ok) {
        setMessage(decideResult.errors.root ?? "Decision failed.");
        return;
      }
      if (decideResult.status === "APPROVED") {
        const applyResult = await withMinimumLoad(
          applySubstitutionApproval({ id }),
        );
        if (!applyResult.ok) {
          setMessage(applyResult.errors.root ?? "Apply failed.");
          return;
        }
        setMessage("Cover applied.");
      } else {
        setMessage("Cover rejected.");
      }
      router.refresh();
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {message ?
        <p className="text-muted-foreground text-sm">{message}</p>
      : null}
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No substitutions match these filters."
          isRowExpanded={(rowId) => expandedId === rowId}
          minWidthClass="min-w-[760px]"
          onRowToggle={(rowId) =>
            setExpandedId((current) => (current === rowId ? null : rowId))
          }
          renderExpandedRow={(row) => {
            const original = row.original as SubstitutionRow;
            return (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{original.slotLabel}</span>
                <span className="text-muted-foreground">
                  {`${original.date} cover ${original.coverName} ${original.reason}`}
                </span>
                <span className="ml-auto flex gap-2">
                  <Button
                    disabled={
                      original.status !== "PENDING" || actingId === original.id
                    }
                    onClick={() => onDecide(original.id, "APPROVE")}
                    size="sm"
                    type="button"
                    variant="outline">
                    {actingId === original.id ?
                      <>
                        <Loader2Icon
                          aria-hidden="true"
                          className="animate-spin"
                        />
                        Working
                      </>
                    : "Approve and apply"}
                  </Button>
                  <Button
                    disabled={
                      original.status !== "PENDING" || actingId === original.id
                    }
                    onClick={() => onDecide(original.id, "REJECT")}
                    size="sm"
                    type="button"
                    variant="ghost">
                    Reject
                  </Button>
                </span>
              </div>
            );
          }}
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} covers. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default SubstitutionsDataTable;
