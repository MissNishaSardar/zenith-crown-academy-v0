"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { Route } from "next";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import { Button } from "@/components/shadcnui/button";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";

export type CalendarDayRow = {
  date: string;
  id: string;
  note: string;
  type: string;
  typeLabel: string;
  yearName: string;
};

export type CalendarYearOption = {
  id: string;
  name: string;
};

export type CalendarTypeOption = {
  label: string;
  value: string;
};

type CalendarListProps = {
  dir: string;
  page: number;
  pageSize: number;
  rows: CalendarDayRow[];
  search: string;
  sort: string;
  total: number;
  totalPages: number;
  type: string;
  types: CalendarTypeOption[];
  yearId: string;
  years: CalendarYearOption[];
};

const columnHelper = legacyCreateColumnHelper<CalendarDayRow>();

const calendarColumns = columnHelper.columns([
  columnHelper.accessor("date", {
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
  columnHelper.accessor("yearName", {
    cell: ({ getValue }) => (
      <span className="bg-secondary text-secondary-foreground w-fit rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
        {getValue()}
      </span>
    ),
    header: "Year",
  }),
  columnHelper.accessor("typeLabel", {
    cell: ({ getValue }) => <span>{getValue()}</span>,
    header: "Type",
  }),
  columnHelper.accessor("note", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground line-clamp-2">{getValue()}</span>
    ),
    header: "Note",
  }),
]);

const CalendarList = ({
  dir,
  page,
  pageSize,
  rows,
  search: initialSearch,
  sort,
  total,
  totalPages,
  type: initialType,
  types,
  yearId: initialYearId,
  years,
}: CalendarListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = (searchParams.get("search") ?? initialSearch)
    .trim()
    .slice(0, 100);
  const [search, setSearch] = useState(initialSearch);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
  }
  const yearId = searchParams.get("yearId") ?? initialYearId;
  const type = searchParams.get("type") ?? initialType;

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (yearId !== "all") params.set("yearId", yearId);
      if (type !== "all") params.set("type", type);
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, type, urlSearch, yearId, pathname, router]);

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: calendarColumns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const current = [{ desc: dir === "desc", id: sort }];
      const next = typeof updater === "function" ? updater(current) : updater;
      const first = next[0];
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (yearId !== "all") params.set("yearId", yearId);
      if (type !== "all") params.set("type", type);
      if (first && (first.id !== "date" || first.desc)) {
        params.set("sort", first.id);
        params.set("dir", first.desc ? "desc" : "asc");
      }
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    },
    pageCount: totalPages,
    state: {
      pagination: { pageIndex: page - 1, pageSize },
      sorting: [{ desc: dir === "desc", id: sort }],
    },
  });

  const goPage = (nextPage: number) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (yearId !== "all") params.set("yearId", yearId);
    if (type !== "all") params.set("type", type);
    if (sort !== "date" || dir !== "asc") {
      params.set("sort", sort);
      params.set("dir", dir);
    }
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}` as Route);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end sm:gap-4">
        <Field className="flex-1">
          <FieldLabel htmlFor="calendar-search">Search notes</FieldLabel>
          <Input
            autoComplete="off"
            id="calendar-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Note like Diwali"
            type="search"
            value={search}
          />
        </Field>
        <Field className="sm:w-auto">
          <FieldLabel htmlFor="calendar-year">Year</FieldLabel>
          <NativeSelect
            className="w-full sm:w-44"
            id="calendar-year"
            onChange={(event) => {
              const params = new URLSearchParams();
              if (search.trim()) params.set("search", search.trim());
              if (event.target.value !== "all")
                params.set("yearId", event.target.value);
              if (type !== "all") params.set("type", type);
              params.set("page", "1");
              router.replace(`${pathname}?${params.toString()}` as Route);
            }}
            value={yearId}>
            <NativeSelectOption value="all">All years</NativeSelectOption>
            {years.map((option) => (
              <NativeSelectOption
                key={option.id}
                value={option.id}>
                {option.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="sm:w-auto">
          <FieldLabel htmlFor="calendar-type">Type</FieldLabel>
          <NativeSelect
            className="w-full sm:w-44"
            id="calendar-type"
            onChange={(event) => {
              const params = new URLSearchParams();
              if (search.trim()) params.set("search", search.trim());
              if (yearId !== "all") params.set("yearId", yearId);
              if (event.target.value !== "all")
                params.set("type", event.target.value);
              params.set("page", "1");
              router.replace(`${pathname}?${params.toString()}` as Route);
            }}
            value={type}>
            <NativeSelectOption value="all">All types</NativeSelectOption>
            {types.map((option) => (
              <NativeSelectOption
                key={option.value}
                value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button
          disabled={search.trim() === "" && yearId === "all" && type === "all"}
          onClick={() => {
            setSearch("");
            router.replace(`${pathname}?page=1` as Route);
          }}
          type="button"
          variant="outline">
          Clear
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No calendar days match these filters."
          minWidthClass="min-w-[680px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} days. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default CalendarList;
