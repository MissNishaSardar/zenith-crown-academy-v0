"use client";

import { Loader2Icon, LockIcon } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcnui/alert-dialog";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import DataTable, {
  DataTablePagination,
} from "@/components/DataTable/DataTable";
import {
  firstRoleName,
  parseRoleNames,
  roleLabels,
} from "@/lib/auth/permissions";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { formatDateDisplay } from "@/lib/formatDate";
import { formatIpAddress } from "@/lib/formatIp";
import {
  revokeAllUserSessions,
  revokeSession,
} from "@/server/admin/sessionActions";

export type SessionRow = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  ipAddress: string | null;
  isCurrent: boolean;
  isExpired: boolean;
  user: {
    email: string;
    id: string;
    name: string;
    role: string;
  };
  userAgent: string | null;
  userId: string;
};

export type SessionGroup = {
  activeCount: number;
  user: {
    email: string;
    id: string;
    name: string;
    role: string;
  };
  userId: string;
};

type SessionsListProps = {
  clearedExpired: number;
  currentUserId: string | null;
  groups: SessionGroup[];
  page: number;
  rows: SessionRow[];
  total: number;
  totalPages: number;
};

const columnHelper = legacyCreateColumnHelper<SessionRow>();

const SessionsList = ({
  clearedExpired,
  currentUserId,
  groups,
  page,
  rows,
  total,
  totalPages,
}: SessionsListProps) => {
  const router = useRouter();
  const [target, setTarget] = useState<SessionRow | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<SessionGroup | null>(null);
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);

  const base = "/dashboard/administrator/sessions";
  const prevHref = `${base}?page=${Math.max(1, page - 1)}` as Route;
  const nextHref = `${base}?page=${Math.min(totalPages, page + 1)}` as Route;

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setTarget(null);
      setError(null);
    }
  };

  const handleConfirm = async () => {
    if (!target || isRevoking) {
      return;
    }
    setIsRevoking(true);
    setError(null);
    const result = await withMinimumLoad(
      revokeSession({ sessionId: target.id }),
    );
    setIsRevoking(false);
    if (!result.ok) {
      setError(result.errors.root ?? "Could not revoke this session.");
      return;
    }
    setTarget(null);
    router.refresh();
  };

  const handleAllDialogChange = (open: boolean) => {
    if (!open) {
      setTargetUser(null);
      setAllError(null);
    }
  };

  const handleConfirmAll = async () => {
    if (!targetUser || isRevokingAll) {
      return;
    }
    setIsRevokingAll(true);
    setAllError(null);
    const result = await withMinimumLoad(
      revokeAllUserSessions({ userId: targetUser.userId }),
    );
    setIsRevokingAll(false);
    if (!result.ok) {
      setAllError(result.errors.root ?? "Could not revoke these sessions.");
      return;
    }
    setTargetUser(null);
    router.refresh();
  };

  const groupDisabledReason = (group: SessionGroup): string | null => {
    if (parseRoleNames(group.user.role).includes("owner")) {
      return "Owner accounts cannot be changed here";
    }
    if (group.userId === currentUserId && group.activeCount <= 1) {
      return "Only your current session is active";
    }
    return null;
  };

  const sessionColumns = columnHelper.columns([
    columnHelper.display({
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.user.name}</span>
          <span className="text-muted-foreground text-xs">
            {row.original.user.email} ·{" "}
            {roleLabels[firstRoleName(row.original.user.role)]}
          </span>
        </span>
      ),
      header: "User",
      id: "user",
    }),
    columnHelper.display({
      cell: ({ row }) => {
        const session = row.original;
        return (
          session.isCurrent ? <Badge>This device</Badge>
          : session.isExpired ? <Badge variant="outline">Expired</Badge>
          : <Badge variant="secondary">Active</Badge>
        );
      },
      header: "Status",
      id: "status",
    }),
    columnHelper.accessor("createdAt", {
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {formatDateDisplay(getValue())}
        </span>
      ),
      header: "Created",
    }),
    columnHelper.accessor("expiresAt", {
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {formatDateDisplay(getValue())}
        </span>
      ),
      header: "Expires",
    }),
    columnHelper.accessor("ipAddress", {
      cell: ({ getValue }) => {
        const value = getValue();
        return (
          <span
            className="text-muted-foreground"
            title={value ?? undefined}>
            {formatIpAddress(value)}
          </span>
        );
      },
      header: "IP address",
    }),
    columnHelper.accessor("userAgent", {
      cell: ({ getValue }) => {
        const value = getValue();
        return (
          <span
            className="text-muted-foreground block max-w-48 truncate"
            title={value ?? undefined}>
            {value ?? "Unknown"}
          </span>
        );
      },
      header: "Device",
    }),
    columnHelper.display({
      cell: ({ row }) => {
        const session = row.original;
        const isOwner = parseRoleNames(session.user.role).includes("owner");
        const rowDisabled = session.isCurrent || session.isExpired;
        return isOwner ?
            <Badge
              variant="outline"
              title="Owner accounts cannot be changed here"
              aria-label="Protected: owner accounts cannot be changed here">
              <LockIcon aria-hidden="true" />
              Protected
            </Badge>
          : <Button
              disabled={rowDisabled}
              onClick={() => {
                setTarget(session);
                setError(null);
              }}
              size="sm"
              type="button"
              variant="outline"
              title={
                session.isCurrent ? "This is your current session"
                : session.isExpired ?
                  "This session already expired"
                : `Revoke session for ${session.user.name}`
              }>
              Revoke
            </Button>;
      },
      header: "",
      id: "actions",
    }),
  ]);

  const table = useLegacyTable({
    columns: sessionColumns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Sessions by user"
        className="overflow-hidden rounded-xl border">
        <ul className="divide-y">
          {groups.length > 0 ?
            groups.map((group) => {
              const disabledReason = groupDisabledReason(group);
              const isSelf = group.userId === currentUserId;
              const isOwnerGroup = parseRoleNames(group.user.role).includes(
                "owner",
              );
              return (
                <li
                  key={group.userId}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {group.user.name}
                      {isSelf ? " (you)" : ""}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {group.user.email} ·{" "}
                      {roleLabels[firstRoleName(group.user.role)]}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {group.activeCount} active
                    </Badge>
                    {isOwnerGroup ?
                      <Badge
                        variant="outline"
                        title="Owner accounts cannot be changed here"
                        aria-label="Protected: owner accounts cannot be changed here">
                        <LockIcon aria-hidden="true" />
                        Protected
                      </Badge>
                    : <Button
                        disabled={disabledReason !== null}
                        onClick={() => {
                          setTargetUser(group);
                          setAllError(null);
                        }}
                        size="sm"
                        title={
                          disabledReason ??
                          (isSelf ?
                            `Revoke all other sessions for ${group.user.name}`
                          : `Revoke all sessions for ${group.user.name}`)
                        }
                        type="button"
                        variant="outline">
                        Revoke all
                      </Button>
                    }
                  </span>
                </li>
              );
            })
          : <li className="text-muted-foreground px-4 py-6 text-center text-sm">
              No active sessions.
            </li>
          }
        </ul>
      </section>
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No sessions found."
          minWidthClass="min-w-[760px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => router.replace(nextHref)}
          onPrevious={() => router.replace(prevHref)}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} active sessions. Page ${page} of ${totalPages}${clearedExpired > 0 ? `, ${clearedExpired} expired cleared.` : "."}`}
          totalPages={totalPages}
        />
        <AlertDialog
          open={target !== null}
          onOpenChange={handleDialogChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
              <AlertDialogDescription>
                {target ?
                  `${target.user.name} will be signed out on that device and must sign in again.`
                : "This session will be signed out and must sign in again."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {error}
              </p>
            : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRevoking}>
                Cancel
              </AlertDialogCancel>
              <Button
                disabled={isRevoking}
                onClick={handleConfirm}
                type="button"
                variant="destructive">
                {isRevoking ?
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                    Revoking
                  </>
                : "Revoke session"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={targetUser !== null}
          onOpenChange={handleAllDialogChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Revoke all sessions for {targetUser?.user.name ?? "this user"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {targetUser ?
                  targetUser.userId === currentUserId ?
                    `${targetUser.user.name} will be signed out on every other device and must sign in again. This device stays signed in.`
                  : `${targetUser.user.name} will be signed out on all ${targetUser.activeCount} active sessions and must sign in again.`

                : "All sessions for this user will be signed out."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {allError ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {allError}
              </p>
            : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRevokingAll}>
                Cancel
              </AlertDialogCancel>
              <Button
                disabled={isRevokingAll}
                onClick={handleConfirmAll}
                type="button"
                variant="destructive">
                {isRevokingAll ?
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                    Revoking
                  </>
                : "Revoke all"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default SessionsList;
