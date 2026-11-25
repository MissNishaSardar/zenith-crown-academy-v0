"use client";

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/shadcnui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcnui/dropdown-menu";
import type { UsersRow } from "./UsersColumns";

import EditUserDialog from "./EditUserDialog";
import ResetPasswordDialog from "./ResetPasswordDialog";
import SetRoleDialog from "./SetRoleDialog";

type UserRowActionsProps = {
  user: UsersRow;
};

const UserRowActions = ({ user }: UserRowActionsProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

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
          className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setEditOpen(true);
              }}>
              Edit user
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setRoleOpen(true);
              }}>
              Change roles
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setPasswordOpen(true);
              }}>
              Reset password
            </DropdownMenuItem>
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
    </>
  );
};

export default UserRowActions;
