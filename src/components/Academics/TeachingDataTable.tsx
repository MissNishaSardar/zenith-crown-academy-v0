"use client";

import { usePathname, useRouter } from "next/navigation";

import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import type { Route } from "next";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";

export type TeachingRow = {
  className: string;
  id: string;
  isActive: boolean;
  sectionName: string;
  subjectName: string;
  teacherName: string;
  yearName: string;
};

type TeachingDataTableProps = {
  dir: string;
  page: number;
  rows: TeachingRow[];
  sort: string;
  total: number;
  totalPages: number;
};

const teachingHelper = legacyCreateColumnHelper<TeachingRow>();

const teachingColumns = teachingHelper.columns([
  teachingHelper.accessor("teacherName", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Teacher"
      />
    ),
  }),
  teachingHelper.accessor("subjectName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Subject",
  }),
  teachingHelper.accessor("className", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Class",
  }),
  teachingHelper.accessor("sectionName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Section",
  }),
  teachingHelper.accessor("isActive", {
    cell: ({ getValue }) => <span>{getValue() ? "Active" : "Inactive"}</span>,
    header: "Status",
  }),
  teachingHelper.accessor("yearName", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Year",
  }),
]);

const TeachingDataTable = ({
  dir,
  page,
  rows,
  sort,
  total,
  totalPages,
}: TeachingDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const teachingTable = useLegacyTable({
    columns: teachingColumns,
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
        emptyMessage="No teaching assignments yet. Assignments require a subject and cover a section or the whole class."
        minWidthClass="min-w-[820px]"
        table={teachingTable}
      />
      <DataTablePagination
        onNext={() => goPage(Math.min(totalPages, page + 1))}
        onPrevious={() => goPage(Math.max(1, page - 1))}
        page={page}
        pageLabel={`Showing ${rows.length} of ${total} assignments. Page ${page} of ${totalPages}.`}
        totalPages={totalPages}
      />
    </div>
  );
};

export default TeachingDataTable;
