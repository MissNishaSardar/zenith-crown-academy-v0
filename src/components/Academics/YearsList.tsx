"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { Route } from "next";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { Button } from "@/components/shadcnui/button";
import { Badge } from "@/components/shadcnui/badge";
import { Card, CardContent } from "@/components/shadcnui/card";
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
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";

export type YearRow = {
  endDate: string;
  id: string;
  name: string;
  startDate: string;
  status: string;
};

type YearsListProps = {
  dir: string;
  page: number;
  pageSize: number;
  rows: YearRow[];
  search: string;
  sort: string;
  status: string;
  total: number;
  totalPages: number;
};

const columnHelper = legacyCreateColumnHelper<YearRow>();

const yearsColumns = columnHelper.columns([
  columnHelper.accessor("name", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Year"
      />
    ),
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
  columnHelper.accessor("startDate", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
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
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Ends"
      />
    ),
  }),
]);

const YearsList = ({
  dir,
  page,
  pageSize,
  rows,
  search: initialSearch,
  sort,
  status: initialStatus,
  total,
  totalPages,
}: YearsListProps) => {
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
  const status = searchParams.get("status") ?? initialStatus;

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, status, urlSearch, pathname, router]);

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: yearsColumns,
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
      if (status !== "all") params.set("status", status);
      if (first && (first.id !== "createdAt" || first.desc)) {
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
    if (status !== "all") params.set("status", status);
    if (sort !== "createdAt" || dir !== "asc") {
      params.set("sort", sort);
      params.set("dir", dir);
    }
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}` as Route);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="sm:flex-row sm:items-end sm:gap-4">
          <Field className="flex-1">
            <FieldLabel htmlFor="years-search">Search years</FieldLabel>
            <Input
              autoComplete="off"
              id="years-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Year name like 2025-2026"
              type="search"
              value={search}
            />
          </Field>
          <Field className="sm:w-auto">
            <FieldLabel htmlFor="years-status">Status</FieldLabel>
            <NativeSelect
              className="w-full sm:w-40"
              id="years-status"
              onChange={(event) => {
                const params = new URLSearchParams();
                if (search.trim()) params.set("search", search.trim());
                if (event.target.value !== "all")
                  params.set("status", event.target.value);
                params.set("page", "1");
                router.replace(`${pathname}?${params.toString()}` as Route);
              }}
              value={status}>
              <NativeSelectOption value="all">All</NativeSelectOption>
              <NativeSelectOption value="UPCOMING">Upcoming</NativeSelectOption>
              <NativeSelectOption value="CURRENT">Current</NativeSelectOption>
              <NativeSelectOption value="CLOSED">Closed</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Button
            disabled={search.trim() === "" && status === "all"}
            onClick={() => {
              setSearch("");
              router.replace(`${pathname}?page=1` as Route);
            }}
            type="button"
            variant="outline">
            Clear
          </Button>
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No years match these filters."
          minWidthClass="min-w-[680px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} years. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default YearsList;
