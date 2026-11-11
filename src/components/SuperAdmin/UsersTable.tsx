"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BanIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  KeyRoundIcon,
  LoaderIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  Undo2Icon,
  UserXIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcnui/dropdown-menu";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcnui/select";
import { Skeleton } from "@/components/shadcnui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcnui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcnui/tooltip";
import { toast } from "@/components/shadcnui/toast";

import { authClient } from "@/lib/auth-client";
import { MIN_LOAD_MS } from "@/lib/auth/withMinimumLoad";
import {
  parseRoleNames,
  resolveRolePath,
  roleLabels,
  roleNames,
  type RoleName,
} from "@/lib/auth/permissions";
import { generateTempPassword } from "@/lib/password";
import { logAudit } from "@/server/audit";
import {
  listAdminUsers,
  type AdminUserRoleFilter,
  type AdminUserRow,
  type AdminUserStatus,
  type AdminUsersPage,
} from "@/server/users";
import BanDialog from "@/components/SuperAdmin/BanDialog";
import ConfirmDialog from "@/components/SuperAdmin/ConfirmDialog";
import PasswordGenerateInput from "@/components/SuperAdmin/PasswordGenerateInput";
import PasswordRevealDialog from "@/components/SuperAdmin/PasswordRevealDialog";
import UserCreateDialog from "@/components/SuperAdmin/UserCreateDialog";
import UserEditDialog from "@/components/SuperAdmin/UserEditDialog";

const PAGE_SIZE = 10;

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
});

type DataTableFeatures = typeof features;

const columnHelper = createColumnHelper<DataTableFeatures, AdminUserRow>();

type UsersTableProps = {
  initialRole: AdminUserRoleFilter;
  initialStatus: AdminUserStatus;
  selfId: string;
};

type ActionItemProps = {
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  reason?: string | undefined;
  destructive?: boolean;
};

type SortDirection = false | "asc" | "desc";

const SortIcon = ({ direction }: { direction: SortDirection }) =>
  direction === "asc" ?
    <ArrowUpIcon
      aria-hidden="true"
      className="size-3.5"
    />
  : direction === "desc" ?
    <ArrowDownIcon
      aria-hidden="true"
      className="size-3.5"
    />
  : <ArrowUpDownIcon
      aria-hidden="true"
      className="size-3.5 opacity-60"
    />;

const statusOf = (user: AdminUserRow) => {
  if (!user.banned) {
    return {
      label: "Active",
      variant: "secondary" as const,
      title: undefined,
    };
  }
  const until = user.banExpiresIso ? new Date(user.banExpiresIso) : null;
  const validUntil = until && !Number.isNaN(until.getTime()) ? until : null;
  return {
    label: validUntil ? `Until ${dateFmt.format(validUntil)}` : "Permanent",
    variant: "destructive" as const,
    title: user.banReason ? `Reason: ${user.banReason}` : undefined,
  };
};

const ActionItem = ({
  destructive = false,
  disabled,
  icon: Icon,
  label,
  onSelect,
  reason,
}: ActionItemProps) => {
  const item = (
    <DropdownMenuItem
      variant={destructive ? "destructive" : "default"}
      disabled={disabled}
      onClick={onSelect}>
      <Icon aria-hidden="true" />
      {label}
    </DropdownMenuItem>
  );
  if (!disabled) {
    return item;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="block"
            tabIndex={0}>
            {item}
          </span>
        }
      />
      <TooltipContent side="left">{reason ?? "Not available"}</TooltipContent>
    </Tooltip>
  );
};

const UsersTable = ({
  initialRole,
  initialStatus,
  selfId,
}: UsersTableProps) => {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState<AdminUserRoleFilter>(initialRole);
  const [status, setStatus] = useState<AdminUserStatus>(initialStatus);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAtIso", desc: true },
  ]);
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<AdminUserRow | null>(null);
  const [banFor, setBanFor] = useState<AdminUserRow | null>(null);
  const [unbanFor, setUnbanFor] = useState<AdminUserRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<AdminUserRow | null>(null);
  const [impersonateFor, setImpersonateFor] = useState<AdminUserRow | null>(
    null,
  );
  const [setPasswordFor, setSetPasswordFor] = useState<AdminUserRow | null>(
    null,
  );
  const [setPasswordValue, setSetPasswordValue] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [reveal, setReveal] = useState<{
    password: string;
    userName: string;
  } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    const sortEntry = sorting[0];
    const sortBy = sortEntry?.id === "name" ? "name" : "createdAt";
    const sortDir = sortEntry?.desc === false ? "asc" : "desc";
    const totalPagesLocal = Math.max(
      1,
      Math.ceil((data?.total ?? 0) / PAGE_SIZE),
    );
    const fetchIndex = Math.min(pagination.pageIndex, totalPagesLocal - 1);

    listAdminUsers({
      page: fetchIndex + 1,
      pageSize: PAGE_SIZE,
      role,
      search: debouncedSearch,
      sortBy,
      sortDir,
      status,
    })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          toast.add({
            type: "error",
            title: "Could not load users",
            description: "Refresh the page to try again.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    data?.total,
    debouncedSearch,
    pagination.pageIndex,
    refreshKey,
    role,
    sorting,
    status,
  ]);

  const total = data?.total ?? 0;
  const users = useMemo(() => data?.users ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIndex = Math.min(pagination.pageIndex, totalPages - 1);
  const showingFrom = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const showingTo = Math.min(total, (pageIndex + 1) * PAGE_SIZE);
  const filtersActive =
    debouncedSearch.trim().length > 0 || role !== "all" || status !== "all";

  const refreshList = () => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  const resetPage = () =>
    setPagination((current) => ({ ...current, pageIndex: 0 }));

  const actAndReport = async (
    user: AdminUserRow,
    run: () => Promise<{ error: { message?: string } | null | undefined }>,
    successTitle: string,
    successDescription: string,
    auditAction:
      "user.unban" | "user.delete" | "user.impersonate" | "user.password_set",
  ) => {
    setConfirmBusy(true);
    const startedAt = Date.now();
    try {
      const { error } = await run();
      if (error) {
        toast.add({
          type: "error",
          title: "Action failed",
          description: error.message || "Please try again.",
        });
        return false;
      }
      try {
        await logAudit({
          action: auditAction,
          target: { userId: user.id, name: user.name, email: user.email },
          details: {},
        });
      } catch {
        toast.add({
          type: "warning",
          title: `${successTitle}, audit entry failed`,
          description:
            "The action was applied but the audit trail was not updated.",
        });
      }
      toast.add({
        type: "success",
        title: successTitle,
        description: successDescription,
      });
      return true;
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOAD_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, MIN_LOAD_MS - elapsed),
        );
      }
      setConfirmBusy(false);
    }
  };

  const onUnban = async () => {
    if (!unbanFor) {
      return;
    }
    const ok = await actAndReport(
      unbanFor,
      () => authClient.admin.unbanUser({ userId: unbanFor.id }),
      "User unbanned",
      `${unbanFor.name} can sign in again.`,
      "user.unban",
    );
    if (ok) {
      setUnbanFor(null);
      refreshList();
    }
  };

  const onDelete = async () => {
    if (!deleteFor) {
      return;
    }
    const ok = await actAndReport(
      deleteFor,
      () => authClient.admin.removeUser({ userId: deleteFor.id }),
      "User deleted",
      `${deleteFor.name} and all of their data were removed.`,
      "user.delete",
    );
    if (ok) {
      setDeleteFor(null);
      refreshList();
    }
  };

  const onImpersonate = async () => {
    if (!impersonateFor) {
      return;
    }
    setConfirmBusy(true);
    const startedAt = Date.now();
    const { error } = await authClient.admin.impersonateUser({
      userId: impersonateFor.id,
    });
    if (error) {
      toast.add({
        type: "error",
        title: "Could not impersonate",
        description: error.message || "Impersonation failed. Try again.",
      });
      setConfirmBusy(false);
      return;
    }
    try {
      await logAudit({
        action: "user.impersonate",
        target: {
          userId: impersonateFor.id,
          name: impersonateFor.name,
          email: impersonateFor.email,
        },
        details: {},
      });
    } catch {
      toast.add({
        type: "warning",
        title: "Impersonation started, audit entry failed",
        description:
          "The session was opened but the audit trail was not updated.",
      });
    }
    const targetHome = resolveRolePath(impersonateFor.role) as Route;
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOAD_MS) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, MIN_LOAD_MS - elapsed),
      );
    }
    setConfirmBusy(false);
    router.push(targetHome);
    router.refresh();
  };

  const onSetPassword = async () => {
    if (!setPasswordFor) {
      return;
    }
    const target = setPasswordFor;
    const newPassword = setPasswordValue;
    if (newPassword.trim().length < 8) {
      toast.add({
        type: "error",
        title: "Password too short",
        description: "Use at least 8 characters.",
      });
      return;
    }
    setConfirmBusy(true);
    const startedAt = Date.now();
    const { error } = await authClient.admin.setUserPassword({
      userId: target.id,
      newPassword,
    });
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOAD_MS) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, MIN_LOAD_MS - elapsed),
      );
    }
    if (error) {
      toast.add({
        type: "error",
        title: "Could not set password",
        description: error.message || "Set password failed. Try again.",
      });
      setConfirmBusy(false);
      return;
    }
    try {
      await logAudit({
        action: "user.password_set",
        target: { userId: target.id, name: target.name, email: target.email },
        details: {},
      });
    } catch {
      toast.add({
        type: "warning",
        title: "Password set, audit entry failed",
        description:
          "The password was changed but the audit trail was not updated.",
      });
    }
    setConfirmBusy(false);
    setSetPasswordFor(null);
    setReveal({ password: newPassword, userName: target.name });
    refreshList();
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setRole("all");
    setStatus("all");
    setLoading(true);
    resetPage();
  };

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: ({ column }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }>
              User
              <SortIcon direction={column.getIsSorted()} />
            </Button>
          ),
          cell: ({ row }) => {
            const user = row.original;
            const isSelf = user.id === selfId;
            return (
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {user.name}
                  {isSelf ?
                    <Badge
                      variant="outline"
                      className="ml-2 align-middle">
                      You
                    </Badge>
                  : null}
                </span>
                <span className="text-muted-foreground max-w-56 truncate text-xs sm:max-w-72">
                  {user.email}
                </span>
                {user.username ?
                  <span className="text-muted-foreground text-xs">
                    @{user.username}
                  </span>
                : null}
              </div>
            );
          },
        }),
        columnHelper.accessor((row) => row.role, {
          id: "roles",
          header: "Roles",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex flex-wrap gap-1">
              {parseRoleNames(row.original.role).map((roleName) => (
                <Badge
                  key={roleName}
                  variant="secondary">
                  {roleLabels[roleName]}
                </Badge>
              ))}
            </div>
          ),
        }),
        columnHelper.accessor("banned", {
          id: "status",
          header: "Status",
          enableSorting: false,
          cell: ({ row }) => {
            const statusInfo = statusOf(row.original);
            return (
              <Badge
                variant={statusInfo.variant}
                title={statusInfo.title}>
                {statusInfo.label}
              </Badge>
            );
          },
        }),
        columnHelper.accessor("createdAtIso", {
          header: ({ column }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }>
              Created
              <SortIcon direction={column.getIsSorted()} />
            </Button>
          ),
          cell: ({ row }) => (
            <span
              title={dateTimeFmt.format(new Date(row.original.createdAtIso))}
              className="text-muted-foreground text-sm tabular-nums">
              {dateFmt.format(new Date(row.original.createdAtIso))}
            </span>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Row actions</span>,
          enableSorting: false,
          cell: ({ row }) => {
            const user = row.original;
            const isSelf = user.id === selfId;
            const superLocked =
              isSelf || parseRoleNames(user.role).includes("super_admin");
            const lockReason =
              isSelf ?
                "This is your own account."
              : "Blocked on super admin accounts.";
            return (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${user.name}`}
                    />
                  }>
                  <MoreHorizontalIcon aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48">
                  <ActionItem
                    icon={PencilLineIcon}
                    label="Edit"
                    disabled={isSelf}
                    reason="This is your own account."
                    onSelect={() => setEditFor(user)}
                  />
                  {user.banned ?
                    <ActionItem
                      icon={Undo2Icon}
                      label="Unban"
                      disabled={superLocked}
                      reason={lockReason}
                      onSelect={() => setUnbanFor(user)}
                    />
                  : <ActionItem
                      icon={BanIcon}
                      label="Ban"
                      destructive
                      disabled={superLocked}
                      reason={lockReason}
                      onSelect={() => setBanFor(user)}
                    />
                  }
                  <ActionItem
                    icon={KeyRoundIcon}
                    label="Set password"
                    disabled={superLocked}
                    reason={lockReason}
                    onSelect={() => {
                      setSetPasswordValue(generateTempPassword());
                      setSetPasswordFor(user);
                    }}
                  />
                  <ActionItem
                    icon={EyeIcon}
                    label="Impersonate"
                    disabled={superLocked}
                    reason={lockReason}
                    onSelect={() => setImpersonateFor(user)}
                  />
                  <ActionItem
                    icon={Trash2Icon}
                    label="Delete"
                    destructive
                    disabled={superLocked}
                    reason={lockReason}
                    onSelect={() => setDeleteFor(user)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        }),
      ]),
    [selfId],
  );

  const table = useTable({
    features,
    columns,
    data: users,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    pageCount: totalPages,
    state: {
      pagination: { pageIndex, pageSize: PAGE_SIZE },
      sorting,
    },
    onPaginationChange: (updater) => {
      setPagination((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return { pageIndex: next.pageIndex, pageSize: PAGE_SIZE };
      });
      setLoading(true);
    },
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.slice(0, 1);
      });
      setLoading(true);
      resetPage();
    },
  });

  const showSkeleton = data === null;

  return (
    <TooltipProvider delay={150}>
      <div className="border-border bg-card flex flex-col overflow-hidden rounded-2xl border shadow-xs">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <SearchIcon
              aria-hidden="true"
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLoading(true);
                resetPage();
              }}
              placeholder="Search by name, email or username"
              aria-label="Search users"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={role}
              onValueChange={(next) => {
                setRole(next as AdminUserRoleFilter);
                setLoading(true);
                resetPage();
              }}>
              <SelectTrigger
                aria-label="Filter by role"
                className="w-40">
                <SelectValue>
                  {(value: string) =>
                    value === "all" ? "All roles" : (
                      (roleLabels[value as RoleName] ?? value)
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All roles</SelectItem>
                  {roleNames.map((roleName: RoleName) => (
                    <SelectItem
                      key={roleName}
                      value={roleName}>
                      {roleLabels[roleName]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <ToggleGroup
              value={[status]}
              onValueChange={(values: string[]) => {
                const next = values.at(-1);
                if (next === "all" || next === "active" || next === "banned") {
                  setStatus(next);
                  setLoading(true);
                  resetPage();
                }
              }}
              spacing={0}
              variant="outline"
              size="sm"
              aria-label="Filter by status">
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="active">Active</ToggleGroupItem>
              <ToggleGroupItem value="banned">Banned</ToggleGroupItem>
            </ToggleGroup>
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}>
              <PlusIcon aria-hidden="true" />
              Create user
            </Button>
          </div>
        </div>

        {/* Table */}
        <div
          className={
            loading && data ?
              "opacity-60 transition-opacity"
            : "transition-opacity"
          }
          aria-busy={loading}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={
                        header.column.id === "actions" ?
                          "w-12 text-right"
                        : undefined
                      }>
                      {header.isPlaceholder ? null : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {showSkeleton ?
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto size-8 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              : table.getRowModel().rows.length === 0 ?
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-56">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      {filtersActive ?
                        <>
                          <UserXIcon
                            aria-hidden="true"
                            className="text-muted-foreground size-8"
                          />
                          <p className="font-heading text-base font-semibold">
                            No users match those filters
                          </p>
                          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                            Try a different search, or clear the role and status
                            filters.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={clearFilters}>
                            Clear filters
                          </Button>
                        </>
                      : <>
                          <UsersIcon
                            aria-hidden="true"
                            className="text-muted-foreground size-8"
                          />
                          <p className="font-heading text-base font-semibold">
                            No users yet
                          </p>
                          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                            Create the first account to get started.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setCreateOpen(true)}>
                            <PlusIcon aria-hidden="true" />
                            Create user
                          </Button>
                        </>
                      }
                    </div>
                  </TableCell>
                </TableRow>
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={
                          cell.column.id === "actions" ?
                            "text-right"
                          : undefined
                        }>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="text-muted-foreground flex items-center gap-2">
            {data ?
              `Showing ${showingFrom} to ${showingTo} of ${total} ${
                total === 1 ? "user" : "users"
              }`
            : "Loading users"}
            {loading ?
              <LoaderIcon
                aria-hidden="true"
                className="size-3.5 animate-spin"
              />
            : null}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground mr-1 tabular-nums">
              Page {pageIndex + 1} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={pageIndex <= 0}
              onClick={() => {
                setLoading(true);
                setPagination((current) => ({
                  ...current,
                  pageIndex: Math.max(0, pageIndex - 1),
                }));
              }}>
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={pageIndex >= totalPages - 1}
              onClick={() => {
                setLoading(true);
                setPagination((current) => ({
                  ...current,
                  pageIndex: Math.min(totalPages - 1, pageIndex + 1),
                }));
              }}>
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {createOpen ?
        <UserCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(password, userName) => {
            setCreateOpen(false);
            setReveal({ password, userName });
            refreshList();
          }}
        />
      : null}
      {editFor ?
        <UserEditDialog
          key={editFor.id}
          open={editFor !== null}
          user={editFor}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setEditFor(null);
            }
          }}
          onDone={() => {
            setEditFor(null);
            refreshList();
            router.refresh();
          }}
        />
      : null}
      {banFor ?
        <BanDialog
          open={banFor !== null}
          user={banFor}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setBanFor(null);
            }
          }}
          onDone={() => {
            setBanFor(null);
            refreshList();
            router.refresh();
          }}
        />
      : null}
      <ConfirmDialog
        open={unbanFor !== null}
        title="Unban user"
        description={
          unbanFor ?
            `${unbanFor.name} will be able to sign in again immediately.`
          : ""
        }
        confirmLabel="Unban user"
        busy={confirmBusy}
        onConfirm={onUnban}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !confirmBusy) {
            setUnbanFor(null);
          }
        }}
      />
      <ConfirmDialog
        open={impersonateFor !== null}
        title="Impersonate user"
        description={
          impersonateFor ?
            `You will act as ${impersonateFor.name} until you stop. The session lasts up to 1 hour. This action is recorded in the audit trail.`
          : ""
        }
        confirmLabel="Impersonate"
        busy={confirmBusy}
        onConfirm={onImpersonate}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !confirmBusy) {
            setImpersonateFor(null);
          }
        }}
      />
      <ConfirmDialog
        key={deleteFor?.id ?? "closed"}
        open={deleteFor !== null}
        title="Delete user"
        description={
          deleteFor ?
            `This permanently removes ${deleteFor.name}, all of their sessions, accounts and data. This cannot be undone. Type ${deleteFor.email} to confirm.`
          : ""
        }
        confirmLabel="Delete user"
        destructive
        busy={confirmBusy}
        requireText={deleteFor?.email}
        requireTextLabel="Type the user's email to confirm"
        onConfirm={onDelete}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !confirmBusy) {
            setDeleteFor(null);
          }
        }}
      />
      {/* Set password dialog */}
      <Dialog
        open={setPasswordFor !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !confirmBusy) {
            setSetPasswordFor(null);
          }
        }}>
        <DialogContent
          showCloseButton={!confirmBusy}
          className="sm:max-w-md">
          <DialogHeader>
            <span
              aria-hidden="true"
              className="border-border bg-secondary/60 text-muted-foreground inline-flex size-11 items-center justify-center rounded-2xl border">
              <KeyRoundIcon className="size-5" />
            </span>
            <DialogTitle className="font-heading text-lg">
              Set new password
            </DialogTitle>
            <DialogDescription>
              {setPasswordFor?.name ?? "This user"} gets this password
              immediately on every device. It is shown once more after you save.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="set-password-input">
              Temporary password
            </FieldLabel>
            <PasswordGenerateInput
              id="set-password-input"
              value={setPasswordValue}
              onChange={setSetPasswordValue}
            />
            {setPasswordValue.length > 0 && setPasswordValue.trim().length < 8 ?
              <FieldError
                errors={[{ message: "Password must be at least 8 characters" }]}
              />
            : null}
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={confirmBusy}
              onClick={() => setSetPasswordFor(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={confirmBusy || setPasswordValue.trim().length < 8}
              onClick={onSetPassword}>
              {confirmBusy ?
                <>
                  <LoaderIcon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Setting
                </>
              : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Password reveal dialog */}
      {reveal ?
        <PasswordRevealDialog
          open={reveal !== null}
          password={reveal.password}
          userName={reveal.userName}
          onClose={() => setReveal(null)}
        />
      : null}
    </TooltipProvider>
  );
};

export default UsersTable;
