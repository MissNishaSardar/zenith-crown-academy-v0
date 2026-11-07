"use client";

import { Loader2Icon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcnui/alert-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/shadcnui/avatar";
import { Button } from "@/components/shadcnui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcnui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

import RoleSwitcher from "./RoleSwitcher";

type ProfileMenuProps = {
  storedRole: string | null | undefined;
  userEmail: string;
  userImage: string | null | undefined;
  userName: string;
};

const MIN_LOAD_MS = 1500;

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return (parts[0]?.[0] ?? "?").toUpperCase();
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
};

const ProfileMenu = ({
  storedRole,
  userEmail,
  userImage,
  userName,
}: ProfileMenuProps) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const initials = getInitials(userName);

  const onSignOut = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    const startedAt = Date.now();
    await authClient.signOut();
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOAD_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_LOAD_MS - elapsed),
      );
    }
    router.push("/login");
    setPending(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-full p-0"
            />
          }
          aria-label="Open profile menu">
          <Avatar size="lg">
            {userImage ?
              <AvatarImage
                src={userImage}
                alt={userName}
              />
            : null}
            <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64">
          <DropdownMenuGroup>
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar size="lg">
                {userImage ?
                  <AvatarImage
                    src={userImage}
                    alt={userName}
                  />
                : null}
                <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {userName}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {userEmail}
                  </span>
                </div>
                <div
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}>
                  <RoleSwitcher storedRole={storedRole} />
                </div>
              </div>
            </div>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmOpen(true)}>
              <LogOutIcon aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!pending) {
            setConfirmOpen(open);
          }
        }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to sign out?
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={onSignOut}>
              {pending ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                  Signing out
                </>
              : "Sign out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProfileMenu;
