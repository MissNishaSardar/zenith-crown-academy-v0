"use client";

import { usePathname, useRouter } from "next/navigation";

import type { Route } from "next";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import AdmissionReviewDialog from "@/components/Academics/AdmissionReviewDialog";
import DataTable, {
  DataTablePagination,
} from "@/components/DataTable/DataTable";

export type ApprovalTableRow = {
  admissionNo: string;
  canReview: boolean;
  className: string;
  duplicateContact: boolean;
  id: string;
  isRedacted: boolean;
  requested: string;
  status: string;
  studentName: string;
  wardFlag: boolean;
  yearName: string;
};

type ApprovalsDataTableProps = {
  isRedacted: boolean;
  page: number;
  pendingCount: number;
  rows: ApprovalTableRow[];
  total: number;
  totalPages: number;
};

const helper = legacyCreateColumnHelper<ApprovalTableRow>();

const approvalsColumns = helper.columns([
  helper.accessor("admissionNo", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: "Admission no",
  }),
  helper.accessor("studentName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Student",
  }),
  helper.accessor("className", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Class",
  }),
  helper.accessor("yearName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Year",
  }),
  helper.accessor("wardFlag", {
    cell: ({ getValue }) => <span>{getValue() ? "Yes" : "No"}</span>,
    header: "Ward",
  }),
  helper.accessor("duplicateContact", {
    cell: ({ getValue }) => <span>{getValue() ? "Yes" : "No"}</span>,
    header: "Duplicate",
  }),
  helper.accessor("status", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Status",
  }),
  helper.accessor("requested", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Requested",
  }),
  helper.display({
    cell: ({ row }) => (
      <AdmissionReviewDialog
        approval={{
          admissionNo: row.original.admissionNo,
          canReview: row.original.canReview,
          className: row.original.className,
          duplicateContact: row.original.duplicateContact,
          id: row.original.id,
          isRedacted: row.original.isRedacted,
          status: row.original.status,
          studentName: row.original.studentName,
          wardFlag: row.original.wardFlag,
          yearName: row.original.yearName,
        }}
      />
    ),
    header: "Review",
    id: "review",
  }),
]);

const ApprovalsDataTable = ({
  isRedacted,
  page,
  pendingCount,
  rows,
  total,
  totalPages,
}: ApprovalsDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const table = useLegacyTable({
    columns: approvalsColumns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const goPage = (nextPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}` as Route);
  };

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="px-4 py-3">
        <h2 className="text-foreground text-base font-semibold">
          Admission approvals
        </h2>
        <p className="text-muted-foreground text-sm">
          {pendingCount} pending admission requests. Nursery to Class 5 gets no
          student login. Class 6 and above gets a login.
          {isRedacted ? " Redacted view for administrator." : ""}
        </p>
      </div>
      <DataTable
        emptyMessage="No approval requests match these filters."
        minWidthClass="min-w-[860px]"
        table={table}
      />
      <DataTablePagination
        onNext={() => goPage(Math.min(totalPages, page + 1))}
        onPrevious={() => goPage(Math.max(1, page - 1))}
        page={page}
        pageLabel={`Showing ${rows.length} of ${total} records. Page ${page} of ${totalPages}.`}
        totalPages={totalPages}
      />
    </div>
  );
};

export default ApprovalsDataTable;
