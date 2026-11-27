"use client";

import { usePathname, useRouter } from "next/navigation";

import type { SortingState } from "@tanstack/react-table";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import type { Route } from "next";
import DataTable, {
  DataTablePagination,
} from "@/components/DataTable/DataTable";

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

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: usersColumns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
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

  return (
    <div className="overflow-hidden rounded-xl border">
      <DataTable
        emptyMessage="No users match these filters."
        minWidthClass="min-w-[760px]"
        table={table}
      />
      <DataTablePagination
        onNext={() => router.replace(nextHref)}
        onPrevious={() => router.replace(prevHref)}
        page={page}
        pageLabel={`Showing ${rows.length} of ${total} users. Page ${page} of ${totalPages}.`}
        totalPages={totalPages}
      />
    </div>
  );
};

export default UsersDataTable;
