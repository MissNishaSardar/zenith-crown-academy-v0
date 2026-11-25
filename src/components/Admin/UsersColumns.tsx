import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import { Checkbox } from "@/components/shadcnui/checkbox";
import { roleLabels, type RoleName } from "@/lib/auth/permissions";

import UserRowActions from "./UserRowActions";

export type UsersRow = {
  createdAt: Date;
  effectiveBanned: boolean;
  email: string;
  id: string;
  name: string;
  role: RoleName;
  roles: RoleName[];
  username: string;
};

const formatDate = (value: Date): string =>
  new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const SortableHeader = ({
  column,
  label,
}: {
  column: {
    getIsSorted: () => false | "asc" | "desc";
    toggleSorting: (desc?: boolean) => void;
  };
  label: string;
}) => {
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

const columnHelper = legacyCreateColumnHelper<UsersRow>();

export const usersColumns = columnHelper.columns([
  columnHelper.display({
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.name}`}
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
      />
    ),
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all users on this page"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
      />
    ),
    id: "select",
  }),
  columnHelper.accessor("name", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Name"
      />
    ),
  }),
  columnHelper.accessor("username", {
    cell: ({ getValue }) => {
      const value = getValue();
      return (
        <span className="text-muted-foreground">
          {value === "" ? "Not set" : value}
        </span>
      );
    },
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Username"
      />
    ),
  }),
  columnHelper.accessor("email", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Email"
      />
    ),
  }),
  columnHelper.accessor("role", {
    cell: ({ row }) => {
      const roles =
        row.original.roles.length > 0 ?
          row.original.roles
        : [row.original.role];
      return roles.map((role) => roleLabels[role]).join(", ");
    },
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Role"
      />
    ),
  }),
  columnHelper.accessor("effectiveBanned", {
    cell: ({ getValue }) => {
      const banned = getValue();
      return (
        <Badge variant={banned ? "destructive" : "secondary"}>
          {banned ? "Banned" : "Active"}
        </Badge>
      );
    },
    enableSorting: false,
    header: "Status",
    id: "status",
  }),
  columnHelper.accessor("createdAt", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{formatDate(getValue())}</span>
    ),
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Created"
      />
    ),
  }),
  columnHelper.display({
    cell: ({ row }) => <UserRowActions user={row.original} />,
    enableSorting: false,
    header: "",
    id: "actions",
  }),
]);
