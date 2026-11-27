"use client";

import { Fragment } from "react";
import type { ReactNode } from "react";
import type { Row, Table as TanStackTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/shadcnui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";

type DataTableProps<TData> = {
  emptyMessage: string;
  isRowExpanded?: (rowId: string) => boolean;
  minWidthClass?: string;
  onRowToggle?: (rowId: string) => void;
  renderExpandedRow?: (row: Row<TData>) => ReactNode | null;
  table: TanStackTable<TData>;
};

const DataTable = <TData,>({
  emptyMessage,
  isRowExpanded,
  minWidthClass = "min-w-[680px]",
  onRowToggle,
  renderExpandedRow,
  table,
}: DataTableProps<TData>) => {
  const columnCount = table.getAllColumns().length;
  const rows = table.getRowModel().rows;

  return (
    <Table className={minWidthClass}>
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
        {rows.length > 0 ?
          rows.map((row) => {
            const expanded = isRowExpanded?.(row.id) ?? false;
            const expandedContent = expanded ? renderExpandedRow?.(row) : null;
            return (
              <Fragment key={row.id}>
                <TableRow
                  aria-expanded={renderExpandedRow ? expanded : undefined}
                  className={
                    onRowToggle ? "hover:bg-muted/40 cursor-pointer" : undefined
                  }
                  onClick={
                    onRowToggle ?
                      (event) => {
                        const target = event.target as HTMLElement;
                        if (
                          target.closest(
                            'button,a,input,select,textarea,[role="button"]',
                          )
                        ) {
                          return;
                        }
                        onRowToggle(row.id);
                      }
                    : undefined
                  }
                  onKeyDown={
                    onRowToggle ?
                      (event) => {
                        if (event.target !== event.currentTarget) {
                          return;
                        }
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowToggle(row.id);
                        }
                      }
                    : undefined
                  }
                  tabIndex={onRowToggle ? 0 : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {expandedContent ?
                  <TableRow>
                    <TableCell colSpan={columnCount}>
                      {expandedContent}
                    </TableCell>
                  </TableRow>
                : null}
              </Fragment>
            );
          })
        : <TableRow>
            <TableCell
              className="h-24 text-center"
              colSpan={columnCount}>
              {emptyMessage}
            </TableCell>
          </TableRow>
        }
      </TableBody>
    </Table>
  );
};

type DataTablePaginationProps = {
  onNext: () => void;
  onPrevious: () => void;
  page: number;
  pageLabel: string;
  totalPages: number;
};

const DataTablePagination = ({
  onNext,
  onPrevious,
  page,
  pageLabel,
  totalPages,
}: DataTablePaginationProps) => (
  <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-muted-foreground text-sm">{pageLabel}</p>
    <div className="flex items-center gap-2">
      <Button
        disabled={page <= 1}
        onClick={onPrevious}
        size="sm"
        type="button"
        variant="outline">
        Previous
      </Button>
      <Button
        disabled={page >= totalPages}
        onClick={onNext}
        size="sm"
        type="button"
        variant="outline">
        Next
      </Button>
    </div>
  </div>
);

type DataTableSortButtonProps = {
  column: {
    getIsSorted: () => false | "asc" | "desc";
    toggleSorting: (desc?: boolean) => void;
  };
  label: string;
};

const DataTableSortButton = ({ column, label }: DataTableSortButtonProps) => {
  const sorted = column.getIsSorted();
  return (
    <Button
      aria-label={`Sort by ${label}`}
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      type="button"
      variant="ghost">
      {label}
      {sorted === "asc" ?
        <ArrowUp data-icon="inline-end" />
      : sorted === "desc" ?
        <ArrowDown data-icon="inline-end" />
      : <ArrowUpDown data-icon="inline-end" />}
    </Button>
  );
};

export default DataTable;
export { DataTablePagination, DataTableSortButton };
