"use client";

import { usePathname, useRouter } from "next/navigation";

import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";

export type EnrollmentRow = {
  admissionNo: string;
  className: string;
  id: string;
  picks: number;
  rollNo: string;
  sectionName: string;
  status: string;
  streamName: string;
  studentName: string;
  yearName: string;
};

type EnrollmentsDataTableProps = {
  dir: string;
  page: number;
  rows: EnrollmentRow[];
  sort: string;
  total: number;
  totalPages: number;
};

const enrollmentHelper = legacyCreateColumnHelper<EnrollmentRow>();

const enrollmentColumns = enrollmentHelper.columns([
  enrollmentHelper.accessor("studentName", {
    cell: ({ getValue, row }) => (
      <span>
        <span className="font-medium">{getValue()}</span>
        <span className="text-muted-foreground block text-xs">
          {row.original.admissionNo}
        </span>
      </span>
    ),
    header: "Student",
  }),
  enrollmentHelper.accessor("rollNo", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Roll"
      />
    ),
  }),
  enrollmentHelper.accessor("className", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Class",
  }),
  enrollmentHelper.accessor("sectionName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Section",
  }),
  enrollmentHelper.accessor("streamName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Stream",
  }),
  enrollmentHelper.accessor("status", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Status",
  }),
  enrollmentHelper.accessor("picks", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Picks",
  }),
  enrollmentHelper.accessor("yearName", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Year",
  }),
]);

const EnrollmentsDataTable = ({
  dir,
  page,
  rows,
  sort,
  total,
  totalPages,
}: EnrollmentsDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const enrollmentTable = useLegacyTable({
    columns: enrollmentColumns,
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
      router.replace(`${pathname}?${params.toString()}`);
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
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="overflow-hidden rounded-xl border">
      <DataTable
        emptyMessage="No enrollments match these filters. Enroll a student to place them for the year."
        minWidthClass="min-w-[860px]"
        table={enrollmentTable}
      />
      <DataTablePagination
        onNext={() => goPage(Math.min(totalPages, page + 1))}
        onPrevious={() => goPage(Math.max(1, page - 1))}
        page={page}
        pageLabel={`Showing ${rows.length} of ${total} enrollments. Page ${page} of ${totalPages}.`}
        totalPages={totalPages}
      />
    </div>
  );
};

export default EnrollmentsDataTable;
