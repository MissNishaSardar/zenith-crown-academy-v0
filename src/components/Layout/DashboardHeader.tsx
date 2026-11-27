"use client";

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/shadcnui/button";
import ProfileMenu from "./ProfileMenu";
import ThemeToggleButton from "./ThemeToggleButton";
import { Breadcrumbs } from "./Breadcrumbs";

type DashboardHeaderProps = {
  collapsed: boolean;
  storedRole: string | null | undefined;
  userEmail: string;
  userImage: string | null | undefined;
  userName: string;
  onOpenMobile: () => void;
  onToggle: () => void;
};

const DashboardHeader = ({
  collapsed,
  storedRole,
  userEmail,
  userImage,
  userName,
  onOpenMobile,
  onToggle,
}: DashboardHeaderProps) => (
  <header className="bg-sidebar/80 border-sidebar-border sticky top-0 z-40 h-16 shrink-0 border-b backdrop-blur-md">
    <div className="flex h-full w-full items-center gap-2 pr-[52px]">
      <Button
        aria-label="Open menu"
        onClick={onOpenMobile}
        size="icon"
        type="button"
        variant="ghost"
        className="shrink-0 rounded-r-md md:hidden">
        <Menu aria-hidden="true" />
      </Button>
      <Button
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggle}
        size="icon"
        type="button"
        variant="ghost"
        className="hidden shrink-0 rounded-r-md md:inline-flex">
        {collapsed ?
          <PanelLeftOpen aria-hidden="true" />
        : <PanelLeftClose aria-hidden="true" />}
      </Button>
      {/* pl-2 plus toggle 36 and row gap 8 sets the 52px crumb offset that main padding mirrors. */}
      <div className="flex min-w-0 flex-1 items-center pl-2">
        <Breadcrumbs />
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

export default DashboardHeader;
