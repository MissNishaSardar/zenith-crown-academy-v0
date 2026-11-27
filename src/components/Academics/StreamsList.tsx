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

export type StreamRow = {
  classId: string;
  className: string;
  id: string;
  name: string;
  subjectCount: number;
  subjectNames: string;
};

export type StreamClassOption = {
  id: string;
  name: string;
};

type StreamsListProps = {
  classId: string;
  classes: StreamClassOption[];
  dir: string;
  page: number;
  pageSize: number;
  rows: StreamRow[];
  search: string;
  sort: string;
  total: number;
  totalPages: number;
};

const columnHelper = legacyCreateColumnHelper<StreamRow>();

const streamsColumns = columnHelper.columns([
  columnHelper.accessor("className", {
    cell: ({ getValue }) => (
      <span className="bg-secondary text-secondary-foreground w-fit rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
        {getValue()}
      </span>
    ),
    header: "Class",
  }),
  columnHelper.accessor("name", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Stream"
      />
    ),
  }),
  columnHelper.accessor("subjectCount", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Subjects",
  }),
  columnHelper.accessor("subjectNames", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground line-clamp-2">{getValue()}</span>
    ),
    header: "Mapped codes",
  }),
]);

const StreamsList = ({
  classId: initialClassId,
  classes,
  dir,
  page,
  pageSize,
  rows,
  search: initialSearch,
  sort,
  total,
  totalPages,
}: StreamsListProps) => {
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
  const classId = searchParams.get("classId") ?? initialClassId;

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (classId !== "all") params.set("classId", classId);
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, classId, urlSearch, pathname, router]);

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: streamsColumns,
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
      if (classId !== "all") params.set("classId", classId);
      if (first && (first.id !== "name" || first.desc)) {
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
    if (classId !== "all") params.set("classId", classId);
    if (sort !== "name" || dir !== "asc") {
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
          <FieldLabel htmlFor="streams-search">Search streams</FieldLabel>
          <Input
            autoComplete="off"
            id="streams-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Stream name like Science"
            type="search"
            value={search}
          />
        </Field>
        <Field className="sm:w-auto">
          <FieldLabel htmlFor="streams-class">Class</FieldLabel>
          <NativeSelect
            className="w-full sm:w-44"
            id="streams-class"
            onChange={(event) => {
              const params = new URLSearchParams();
              if (search.trim()) params.set("search", search.trim());
              if (event.target.value !== "all")
                params.set("classId", event.target.value);
              params.set("page", "1");
              router.replace(`${pathname}?${params.toString()}` as Route);
            }}
            value={classId}>
            <NativeSelectOption value="all">All classes</NativeSelectOption>
            {classes.map((option) => (
              <NativeSelectOption
                key={option.id}
                value={option.id}>
                {option.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button
          disabled={search.trim() === "" && classId === "all"}
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
          emptyMessage="No streams match these filters."
          minWidthClass="min-w-[680px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} streams. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default StreamsList;
