"use client";

import {
  Ban,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Undo2,
  UserCog,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/shadcnui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcnui/dropdown-menu";
import type { UsersRow } from "./UsersColumns";

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
    </>
  );
};

export default UserRowActions;
