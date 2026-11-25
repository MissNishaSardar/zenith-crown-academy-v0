"use client";

import { Loader2Icon } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";
import { firstRoleName, roleLabels } from "@/lib/auth/permissions";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { revokeSession } from "@/server/admin/sessionActions";

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

type SessionsListProps = {
  page: number;
  rows: SessionRow[];
  total: number;
  totalPages: number;
};

const formatDate = (value: Date): string =>
  new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const SessionsList = ({ page, rows, total, totalPages }: SessionsListProps) => {
  const router = useRouter();
  const [target, setTarget] = useState<SessionRow | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>IP address</TableHead>
            <TableHead>Device</TableHead>
            <TableHead aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ?
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span className="flex flex-col">
                    <span className="font-medium">{row.user.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {row.user.email} ·{" "}
                      {roleLabels[firstRoleName(row.user.role)]}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  {row.isCurrent ?
                    <Badge>This device</Badge>
                  : row.isExpired ?
                    <Badge variant="outline">Expired</Badge>
                  : <Badge variant="secondary">Active</Badge>}
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {formatDate(row.expiresAt)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {row.ipAddress ?? "Unknown"}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className="text-muted-foreground block max-w-48 truncate"
                    title={row.userAgent ?? undefined}>
                    {row.userAgent ?? "Unknown"}
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    disabled={row.isCurrent || row.isExpired}
                    onClick={() => {
                      setTarget(row);
                      setError(null);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                    title={
                      row.isCurrent ? "This is your current session"
                      : row.isExpired ?
                        "This session already expired"
                      : `Revoke session for ${row.user.name}`
                    }>
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))
          : <TableRow>
              <TableCell
                className="h-24 text-center"
                colSpan={7}>
                No sessions found.
              </TableCell>
            </TableRow>
          }
        </TableBody>
      </Table>
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Showing {rows.length} of {total} sessions. Page {page} of {totalPages}
          .
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
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
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
    </div>
  );
};

export default SessionsList;
