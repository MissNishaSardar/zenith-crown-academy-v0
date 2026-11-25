"use client";

import {
  Ban,
  KeyRound,
  Loader2Icon,
  MoreHorizontal,
  Pencil,
  Undo2,
  UserCog,
  VenetianMask,
} from "lucide-react";
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
import { Button } from "@/components/shadcnui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcnui/dropdown-menu";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import type { UsersRow } from "./UsersColumns";

import { startImpersonation } from "@/server/admin/sessionActions";

import EditUserDialog from "./EditUserDialog";
import BanUserDialog from "./BanUserDialog";
import ResetPasswordDialog from "./ResetPasswordDialog";
import SetRoleDialog from "./SetRoleDialog";
import UnbanUserDialog from "./UnbanUserDialog";

type UserRowActionsProps = {
  user: UsersRow;
};

const UserRowActions = ({ user }: UserRowActionsProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [unbanOpen, setUnbanOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  const canImpersonate =
    !user.effectiveBanned &&
    !user.roles.some((role) => role === "owner" || role === "administrator");

  const handleImpersonateDialogChange = (open: boolean) => {
    if (!open) {
      setImpersonateOpen(false);
      setImpersonateError(null);
    }
  };

  const handleImpersonate = async () => {
    if (isImpersonating) {
      return;
    }
    setIsImpersonating(true);
    setImpersonateError(null);
    const result = await withMinimumLoad(
      startImpersonation({ userId: user.id }),
    );
    setIsImpersonating(false);
    if (!result.ok) {
      setImpersonateError(
        result.errors.root ?? "Could not start impersonation.",
      );
      return;
    }
    setImpersonateOpen(false);
    window.location.assign("/dashboard");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
            />
          }
          aria-label={`Actions for ${user.name}`}>
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setEditOpen(true);
              }}>
              <Pencil aria-hidden="true" />
              Edit user
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setRoleOpen(true);
              }}>
              <UserCog aria-hidden="true" />
              Change roles
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setPasswordOpen(true);
              }}>
              <KeyRound aria-hidden="true" />
              Reset password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.effectiveBanned ?
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setUnbanOpen(true);
                }}>
                <Undo2 aria-hidden="true" />
                Unban user
              </DropdownMenuItem>
            : <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setBanOpen(true);
                }}>
                <Ban aria-hidden="true" />
                Ban user
              </DropdownMenuItem>
            }
            {canImpersonate ?
              <DropdownMenuItem
                onClick={() => {
                  setImpersonateOpen(true);
                }}>
                <VenetianMask aria-hidden="true" />
                Impersonate user
              </DropdownMenuItem>
            : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditUserDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        user={user}
      />
      <SetRoleDialog
        open={roleOpen}
        onOpenChange={setRoleOpen}
        user={user}
      />
      <ResetPasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        user={user}
      />
      <BanUserDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        user={user}
      />
      <UnbanUserDialog
        open={unbanOpen}
        onOpenChange={setUnbanOpen}
        user={user}
      />
      <AlertDialog
        open={impersonateOpen}
        onOpenChange={handleImpersonateDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Impersonate user</AlertDialogTitle>
            <AlertDialogDescription>
              {`Sign in as ${user.name} to reproduce an issue. Stop impersonating when done.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {impersonateError ?
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
              {impersonateError}
            </p>
          : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImpersonating}>
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={isImpersonating}
              onClick={handleImpersonate}
              type="button">
              {isImpersonating ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Starting
                </>
              : "Impersonate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserRowActions;
