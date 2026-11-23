"use client";

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

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
    <div className="flex h-full w-full items-center gap-2 pr-4 sm:pr-6">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMobile}
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-r-md transition-colors md:hidden">
        <Menu
          aria-hidden="true"
          className="size-5"
        />
      </button>
      <button
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground hidden size-9 shrink-0 cursor-pointer items-center justify-center rounded-r-md transition-colors md:flex">
        {collapsed ?
          <PanelLeftOpen
            aria-hidden="true"
            className="size-5"
          />
        : <PanelLeftClose
            aria-hidden="true"
            className="size-5"
          />
        }
      </button>
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
