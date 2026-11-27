"use client";

import { usePathname, useRouter } from "next/navigation";

import type { Route } from "next";

import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import { useState } from "react";
import { Badge } from "@/components/shadcnui/badge";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";
import DisciplineDialog, {
  type DisciplineIncidentSummary,
} from "@/components/Academics/DisciplineDialog";

export type DisciplineRow = {
  actionTaken: string | null;
  category: string;
  date: string;
  description: string;
  id: string;
  status: string;
  studentId: string;
  studentName: string;
  yearId: string;
};

type DisciplineListProps = {
  dir: string;
  page: number;
  rows: DisciplineRow[];
  sort: string;
  total: number;
  totalPages: number;
};

const disciplineHelper = legacyCreateColumnHelper<DisciplineRow>();

const disciplineColumns = disciplineHelper.columns([
  disciplineHelper.accessor("date", {
    cell: ({ getValue }) => (
      <span className="font-medium whitespace-nowrap">{getValue()}</span>
    ),
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Date"
      />
    ),
  }),
  disciplineHelper.accessor("studentName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Student",
  }),
  disciplineHelper.accessor("category", {
    cell: ({ getValue }) => (
      <Badge
        variant="secondary"
        className="w-fit whitespace-nowrap">
        {getValue()}
      </Badge>
    ),
    header: "Category",
  }),
  disciplineHelper.accessor("status", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Status"
      />
    ),
  }),
]);

const DisciplineList = ({
  dir,
  page,
  rows,
  sort,
  total,
  totalPages,
}: DisciplineListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const table = useLegacyTable({
    columns: disciplineColumns,
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

  return (
    <div className="overflow-hidden rounded-xl border">
      <DataTable
        emptyMessage="No discipline incidents match these filters."
        isRowExpanded={(rowId) => expandedId === rowId}
        minWidthClass="min-w-[760px]"
        onRowToggle={(rowId) =>
          setExpandedId((current) => (current === rowId ? null : rowId))
        }
        renderExpandedRow={(row) => {
          const original = row.original as DisciplineRow;
          const summary: DisciplineIncidentSummary = {
            actionTaken: original.actionTaken,
            category: original.category,
            date: original.date,
            description: original.description,
            id: original.id,
            status: original.status,
            studentId: original.studentId,
            studentName: original.studentName,
            yearId: original.yearId,
          };
          return (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground line-clamp-2 flex-1">
                {original.description}
              </span>
              <DisciplineDialog
                incident={summary}
                studentId={original.studentId}
                studentName={original.studentName}
                yearId={original.yearId}
              />
            </div>
          );
        }}
        table={table}
      />
      <DataTablePagination
        onNext={() => goPage(Math.min(totalPages, page + 1))}
        onPrevious={() => goPage(Math.max(1, page - 1))}
        page={page}
        pageLabel={`Showing ${rows.length} of ${total} incidents. Page ${page} of ${totalPages}.`}
        totalPages={totalPages}
      />
    </div>
  );
};

export default DisciplineList;
