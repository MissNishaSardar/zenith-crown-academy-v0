"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import type { Route } from "next";
import { Button } from "@/components/shadcnui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";

import { usersColumns, type UsersRow } from "./UsersColumns";

type UsersDataTableProps = {
  banned: string;
  dir: string;
  page: number;
  pageSize: number;
  role: string;
  rows: UsersRow[];
  search: string;
  sort: string;
  sorting: SortingState;
  total: number;
  totalPages: number;
};

const buildPageHref = (
  values: {
    banned: string;
    dir: string;
    page: number;
    role: string;
    search: string;
    sort: string;
  },
  base: string,
): string => {
  const params = new URLSearchParams();
  if (values.search) {
    params.set("search", values.search);
  }
  if (values.role !== "all") {
    params.set("role", values.role);
  }
  if (values.banned !== "all") {
    params.set("banned", values.banned);
  }
  if (values.sort !== "createdAt" || values.dir !== "asc") {
    params.set("sort", values.sort);
    params.set("dir", values.dir);
  }
  params.set("page", String(values.page));
  return `${base}?${params.toString()}`;
};

const UsersDataTable = ({
  banned,
  dir,
  page,
  pageSize,
  role,
  rows,
  search,
  sort,
  sorting,
  total,
  totalPages,
}: UsersDataTableProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: usersColumns,
    data: rows,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      const params = new URLSearchParams();
      if (search) {
        params.set("search", search);
      }
      if (role !== "all") {
        params.set("role", role);
      }
      if (banned !== "all") {
        params.set("banned", banned);
      }
      // Omit the default sort from the URL so header sorting back to
      // createdAt asc matches the canonical pagination links.
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
      rowSelection,
      sorting,
    },
  });

  const base = "/dashboard/administrator/users";
  const shared = { banned, dir, role, search, sort };
  const prevHref = buildPageHref(
    { ...shared, page: Math.max(1, page - 1) },
    base,
  ) as Route;
  const nextHref = buildPageHref(
    { ...shared, page: Math.min(totalPages, page + 1) },
    base,
  ) as Route;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table className="min-w-[760px]">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ?
            table.getRowModel().rows.map((row) => (
              <TableRow
                data-state={row.getIsSelected() && "selected"}
                key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          : <TableRow>
              <TableCell
                className="h-24 text-center"
                colSpan={usersColumns.length}>
                No users match these filters.
              </TableCell>
            </TableRow>
          }
        </TableBody>
      </Table>
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Showing {rows.length} of {total} users. Page {page} of {totalPages}.
          {selectedCount > 0 ?
            ` ${selectedCount} selected on this page.`
          : null}
        </p>
        <div className="flex items-center gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => router.replace(prevHref)}
            size="sm"
            type="button"
            variant="outline">
            Previous
          </Button>
          <Button
            disabled={page >= totalPages}
            onClick={() => router.replace(nextHref)}
            size="sm"
            type="button"
            variant="outline">
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UsersDataTable;
