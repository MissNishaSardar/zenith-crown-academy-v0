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

export type SubjectRow = {
  classCount: number;
  code: string;
  id: string;
  name: string;
  streamCount: number;
};

type SubjectsListProps = {
  dir: string;
  page: number;
  pageSize: number;
  rows: SubjectRow[];
  search: string;
  sort: string;
  total: number;
  totalPages: number;
};

const columnHelper = legacyCreateColumnHelper<SubjectRow>();

const subjectsColumns = columnHelper.columns([
  columnHelper.accessor("code", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Code"
      />
    ),
  }),
  columnHelper.accessor("name", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Subject"
      />
    ),
  }),
  columnHelper.accessor("classCount", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Classes",
  }),
  columnHelper.accessor("streamCount", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Streams",
  }),
]);

const SubjectsList = ({
  dir,
  page,
  pageSize,
  rows,
  search: initialSearch,
  sort,
  total,
  totalPages,
}: SubjectsListProps) => {
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

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, urlSearch, pathname, router]);

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: subjectsColumns,
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
      if (first && (first.id !== "code" || first.desc)) {
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
    if (sort !== "code" || dir !== "asc") {
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
          <FieldLabel htmlFor="subjects-search">Search subjects</FieldLabel>
          <Input
            autoComplete="off"
            id="subjects-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Code or name like ENG"
            type="search"
            value={search}
          />
        </Field>
        <Button
          disabled={search.trim() === ""}
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
          emptyMessage="No subjects match these filters."
          minWidthClass="min-w-[620px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} subjects. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default SubjectsList;
