"use client";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/shadcnui/separator";
import { SidebarTrigger } from "@/components/shadcnui/sidebar";
import {
  firstRoleName,
  parseRoleNames,
  roleLabels,
  roleUrlSlug,
} from "@/lib/auth/permissions";

import ProfileMenu from "./ProfileMenu";
import ThemeToggleButton from "./ThemeToggleButton";

type DashboardHeaderProps = {
  storedRole: string | null | undefined;
  userEmail: string;
  userImage: string | null | undefined;
  userName: string;
};

const DashboardHeader = ({
  storedRole,
  userEmail,
  userImage,
  userName,
}: DashboardHeaderProps) => {
  const pathname = usePathname();
  const roles = parseRoleNames(storedRole);
  const activeRole =
    roles.find(
      (role) =>
        pathname === `/dashboard/${roleUrlSlug(role)}` ||
        pathname.startsWith(`/dashboard/${roleUrlSlug(role)}/`),
    ) ?? firstRoleName(storedRole);
  const roleLabel = roleLabels[activeRole];

  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 h-14 shrink-0 border-b backdrop-blur-md">
      <div className="flex h-full w-full items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="h-4"
          />
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <span className="text-muted-foreground">Dashboard</span>
            <span
              aria-hidden="true"
              className="text-muted-foreground">
              /
            </span>
            <span className="truncate font-semibold">{roleLabel}</span>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <ThemeToggleButton />
          <ProfileMenu
            storedRole={storedRole}
            userEmail={userEmail}
            userImage={userImage}
            userName={userName}
          />
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
