"use client";

import { usePathname, useRouter } from "next/navigation";

import type { Route } from "next";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";

export type AdmissionStudentRow = {
  admissionNo: string;
  className: string;
  guardians: string;
  id: string;
  percentVerified: number;
  status: string;
  studentName: string;
  total: number;
  verified: number;
  yearName: string;
};

export type AdmissionApprovalRow = {
  admissionNo: string;
  duplicate: boolean;
  id: string;
  requested: string;
  status: string;
  wardFlag: boolean;
};

type AdmissionsDataTableProps = {
  approvalRows: AdmissionApprovalRow[];
  dir: string;
  page: number;
  pendingApprovals: number;
  rows: AdmissionStudentRow[];
  sort: string;
  total: number;
  totalPages: number;
};

const studentHelper = legacyCreateColumnHelper<AdmissionStudentRow>();
const approvalHelper = legacyCreateColumnHelper<AdmissionApprovalRow>();

const studentColumns = studentHelper.columns([
  studentHelper.accessor("admissionNo", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Admission no"
      />
    ),
  }),
  studentHelper.accessor("studentName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Student",
  }),
  studentHelper.accessor("className", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Class",
  }),
  studentHelper.accessor("yearName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Year",
  }),
  studentHelper.accessor("status", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Status",
  }),
  studentHelper.accessor("guardians", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground block max-w-56 truncate">
        {getValue()}
      </span>
    ),
    header: "Guardians",
  }),
  studentHelper.display({
    cell: ({ row }) => (
      <span className="block">
        <span className="text-muted-foreground text-xs">
          {row.original.verified}/{row.original.total} verified
        </span>
        <span className="bg-muted mt-1 block h-1.5 w-24 overflow-hidden rounded-full">
          <span
            className="bg-primary block h-full rounded-full"
            style={{ width: `${row.original.percentVerified}%` }}
          />
        </span>
      </span>
    ),
    header: "Checklist",
    id: "checklist",
  }),
]);

const approvalColumns = approvalHelper.columns([
  approvalHelper.accessor("admissionNo", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: "Admission no",
  }),
  approvalHelper.accessor("status", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Status",
  }),
  approvalHelper.accessor("wardFlag", {
    cell: ({ getValue }) => <span>{getValue() ? "Yes" : "No"}</span>,
    header: "Ward flag",
  }),
  approvalHelper.accessor("duplicate", {
    cell: ({ getValue }) => <span>{getValue() ? "Yes" : "No"}</span>,
    header: "Duplicate",
  }),
  approvalHelper.accessor("requested", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Requested",
  }),
]);

const AdmissionsDataTable = ({
  approvalRows,
  dir,
  page,
  pendingApprovals,
  rows,
  sort,
  total,
  totalPages,
}: AdmissionsDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const studentTable = useLegacyTable({
    columns: studentColumns,
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

  const approvalTable = useLegacyTable({
    columns: approvalColumns,
    data: approvalRows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const goPage = (nextPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}` as Route);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No admission records match these filters. Submit an admission to start the queue."
          minWidthClass="min-w-[860px]"
          table={studentTable}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} records. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="px-4 py-3">
          <h2 className="text-foreground text-base font-semibold">
            Admission approvals
          </h2>
          <p className="text-muted-foreground text-sm">
            {pendingApprovals} pending admission requests. New submissions
            create a request with ward and duplicate flags for staff review.
          </p>
        </div>
        <DataTable
          emptyMessage="No admission requests yet."
          minWidthClass="min-w-[680px]"
          table={approvalTable}
        />
      </div>
    </div>
  );
};

export default AdmissionsDataTable;
