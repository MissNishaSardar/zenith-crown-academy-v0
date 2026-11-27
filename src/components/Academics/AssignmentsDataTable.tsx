"use client";

import { usePathname, useRouter } from "next/navigation";

import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import { useState } from "react";
import { Badge } from "@/components/shadcnui/badge";
import AssignmentDialog, {
  type AssignmentEdit,
} from "@/components/Academics/AssignmentDialog";
import AssignmentSubmissions, {
  type SubmissionView,
} from "@/components/Academics/AssignmentSubmissions";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";

export type AssignmentRow = {
  classId: string;
  className: string;
  dueDate: string;
  id: string;
  sectionId: string | null;
  sectionName: string;
  status: string;
  subjectId: string;
  subjectName: string;
  submissionCount: number;
  title: string;
  yearId: string;
  yearName: string;
};

export type AssignmentExpanded = {
  assignmentId: string;
  canGrade: boolean;
  canSubmit: boolean;
  edit: AssignmentEdit | null;
  status: string;
  submissions: SubmissionView[];
  submitOptions: { studentId: string; studentName: string }[];
};

type AssignmentsDataTableProps = {
  canWrite: boolean;
  classes: { id: string; name: string }[];
  dir: string;
  expandedById: Record<string, AssignmentExpanded>;
  page: number;
  rows: AssignmentRow[];
  sections: { classId: string; id: string; name: string; yearId: string }[];
  sort: string;
  subjects: { code: string; id: string; name: string }[];
  total: number;
  totalPages: number;
  years: { id: string; name: string; status: string }[];
};

const assignmentHelper = legacyCreateColumnHelper<AssignmentRow>();

const assignmentColumns = assignmentHelper.columns([
  assignmentHelper.accessor("title", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Title"
      />
    ),
  }),
  assignmentHelper.accessor("subjectName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Subject",
  }),
  assignmentHelper.accessor("className", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Class",
  }),
  assignmentHelper.accessor("sectionName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Section",
  }),
  assignmentHelper.accessor("dueDate", {
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap">{getValue() || "No due date"}</span>
    ),
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Due"
      />
    ),
  }),
  assignmentHelper.accessor("status", {
    cell: ({ getValue }) => (
      <Badge
        variant="secondary"
        className="w-fit whitespace-nowrap">
        {getValue()}
      </Badge>
    ),
    header: "Status",
  }),
  assignmentHelper.accessor("submissionCount", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Submissions",
  }),
  assignmentHelper.accessor("yearName", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Year",
  }),
]);

const AssignmentsDataTable = ({
  canWrite,
  classes,
  dir,
  expandedById,
  page,
  rows,
  sections,
  sort,
  subjects,
  total,
  totalPages,
  years,
}: AssignmentsDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const table = useLegacyTable({
    columns: assignmentColumns,
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
        emptyMessage="No assignments match these filters. Publish classwork to get started."
        isRowExpanded={(rowId) => expandedId === rowId}
        minWidthClass="min-w-[860px]"
        onRowToggle={(rowId) =>
          setExpandedId((current) => (current === rowId ? null : rowId))
        }
        renderExpandedRow={(row) => {
          const detail = expandedById[row.original.id];
          if (!detail) return null;
          return (
            <div className="flex flex-col gap-3">
              {detail.edit && canWrite ?
                <div className="flex justify-end">
                  <AssignmentDialog
                    assignment={detail.edit}
                    canWrite={canWrite}
                    classes={classes}
                    sections={sections}
                    subjects={subjects}
                    years={years}
                  />
                </div>
              : null}
              <AssignmentSubmissions
                assignmentId={detail.assignmentId}
                canGrade={detail.canGrade}
                canSubmit={detail.canSubmit}
                status={detail.status}
                submissions={detail.submissions}
                submitOptions={detail.submitOptions}
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
        pageLabel={`Showing ${rows.length} of ${total} assignments. Page ${page} of ${totalPages}.`}
        totalPages={totalPages}
      />
    </div>
  );
};

export default AssignmentsDataTable;
