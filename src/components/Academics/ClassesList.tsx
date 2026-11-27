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

export type ClassRow = {
  band: string;
  id: string;
  isActive: boolean;
  name: string;
  order: number;
};

type ClassesListProps = {
  band: string;
  dir: string;
  page: number;
  pageSize: number;
  rows: ClassRow[];
  search: string;
  sort: string;
  total: number;
  totalPages: number;
};

const columnHelper = legacyCreateColumnHelper<ClassRow>();

const classesColumns = columnHelper.columns([
  columnHelper.accessor("order", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Order"
      />
    ),
  }),
  columnHelper.accessor("name", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Class"
      />
    ),
  }),
  columnHelper.accessor("band", {
    cell: ({ getValue }) => (
      <span className="bg-secondary text-secondary-foreground w-fit rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
        {String(getValue()).replace("_", " ")}
      </span>
    ),
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Band"
      />
    ),
  }),
]);

const ClassesList = ({
  band: initialBand,
  dir,
  page,
  pageSize,
  rows,
  search: initialSearch,
  sort,
  total,
  totalPages,
}: ClassesListProps) => {
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
  const band = searchParams.get("band") ?? initialBand;

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (band !== "all") params.set("band", band);
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, band, urlSearch, pathname, router]);

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: classesColumns,
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
      if (band !== "all") params.set("band", band);
      if (first && (first.id !== "order" || first.desc)) {
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
    if (band !== "all") params.set("band", band);
    if (sort !== "order" || dir !== "asc") {
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
          <FieldLabel htmlFor="classes-search">Search classes</FieldLabel>
          <Input
            autoComplete="off"
            id="classes-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Class name like Class 10"
            type="search"
            value={search}
          />
        </Field>
        <Field className="sm:w-auto">
          <FieldLabel htmlFor="classes-band">Band</FieldLabel>
          <NativeSelect
            className="w-full sm:w-44"
            id="classes-band"
            onChange={(event) => {
              const params = new URLSearchParams();
              if (search.trim()) params.set("search", search.trim());
              if (event.target.value !== "all")
                params.set("band", event.target.value);
              params.set("page", "1");
              router.replace(`${pathname}?${params.toString()}` as Route);
            }}
            value={band}>
            <NativeSelectOption value="all">All bands</NativeSelectOption>
            <NativeSelectOption value="PRE_PRIMARY">
              Pre primary
            </NativeSelectOption>
            <NativeSelectOption value="PRIMARY">Primary</NativeSelectOption>
            <NativeSelectOption value="MIDDLE">Middle</NativeSelectOption>
            <NativeSelectOption value="SECONDARY">Secondary</NativeSelectOption>
            <NativeSelectOption value="SENIOR_SECONDARY">
              Senior secondary
            </NativeSelectOption>
          </NativeSelect>
        </Field>
        <Button
          disabled={search.trim() === "" && band === "all"}
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
          emptyMessage="No classes match these filters."
          minWidthClass="min-w-[620px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} classes. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default ClassesList;
