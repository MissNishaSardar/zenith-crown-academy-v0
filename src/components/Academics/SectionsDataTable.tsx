"use client";

import { usePathname, useRouter } from "next/navigation";

import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";

export type SectionRow = {
  capacity: number;
  className: string;
  id: string;
  teacherName: string;
  yearName: string;
  sectionName: string;
};

export type CalendarDayRow = {
  date: string;
  id: string;
  note: string;
  type: string;
};

type SectionsDataTableProps = {
  calendarRows: CalendarDayRow[];
  dir: string;
  page: number;
  rows: SectionRow[];
  sort: string;
  total: number;
  totalPages: number;
  yearId: string;
};

const sectionHelper = legacyCreateColumnHelper<SectionRow>();
const dayHelper = legacyCreateColumnHelper<CalendarDayRow>();

const sectionColumns = sectionHelper.columns([
  sectionHelper.accessor("yearName", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Year",
  }),
  sectionHelper.accessor("className", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Class",
  }),
  sectionHelper.accessor("sectionName", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Section"
      />
    ),
  }),
  sectionHelper.accessor("capacity", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Capacity"
      />
    ),
  }),
  sectionHelper.accessor("teacherName", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Class teacher",
  }),
]);

const dayColumns = dayHelper.columns([
  dayHelper.accessor("date", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Date",
  }),
  dayHelper.accessor("type", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Type",
  }),
  dayHelper.accessor("note", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Note",
  }),
]);

const SectionsDataTable = ({
  calendarRows,
  dir,
  page,
  rows,
  sort,
  total,
  totalPages,
  yearId,
}: SectionsDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const sectionTable = useLegacyTable({
    columns: sectionColumns,
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

  const dayTable = useLegacyTable({
    columns: dayColumns,
    data: calendarRows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const goPage = (nextPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No sections yet. Create sections per year and class with a class teacher and capacity."
          minWidthClass="min-w-[720px]"
          table={sectionTable}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} sections. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="px-4 py-3">
          <h2 className="text-foreground text-base font-semibold">
            Calendar days
          </h2>
          <p className="text-muted-foreground text-sm">
            Holidays, exam breaks and working Saturdays scope attendance rates
            and the timetable.
          </p>
        </div>
        <DataTable
          emptyMessage={
            yearId === "all" ?
              "Pick a year to see its calendar days."
            : "No calendar days for this year yet."
          }
          minWidthClass="min-w-[560px]"
          table={dayTable}
        />
      </div>
    </div>
  );
};

export default SectionsDataTable;
