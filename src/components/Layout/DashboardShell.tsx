"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { getDashboardLinks } from "@/lib/dashboard-nav";

import BreadcrumbProvider from "./Breadcrumbs";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";

const COLLAPSED_KEY = "zca-sidebar-collapsed";
const COLLAPSED_EVENT = "zca-sidebar-change";

const subscribeCollapsed = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(COLLAPSED_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(COLLAPSED_EVENT, notify);
  };
};

const readCollapsed = () => window.localStorage.getItem(COLLAPSED_KEY) !== "0";

type DashboardShellProps = {
  children: ReactNode;
  storedRole: string | null | undefined;
  userEmail: string;
  userImage: string | null | undefined;
  userName: string;
};

const DashboardShell = ({
  children,
  storedRole,
  userEmail,
  userImage,
  userName,
}: DashboardShellProps) => {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => true,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openAt, setOpenAt] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onToggle = useCallback(() => {
    window.localStorage.setItem(COLLAPSED_KEY, readCollapsed() ? "0" : "1");
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  }, []);

  const onCloseMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const onOpenMobile = useCallback(() => {
    setOpenAt(pathname);
    setMobileOpen(true);
  }, [pathname]);

  const links = getDashboardLinks(storedRole);
  const drawerOpen = mobileOpen && openAt === pathname;

  return (
    <BreadcrumbProvider>
      <div className="flex min-h-svh">
        <DashboardSidebar
          collapsed={collapsed}
          links={links}
          mobileOpen={drawerOpen}
          onCloseMobile={onCloseMobile}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardHeader
            collapsed={collapsed}
            storedRole={storedRole}
            userEmail={userEmail}
            userImage={userImage}
            userName={userName}
            onOpenMobile={onOpenMobile}
            onToggle={onToggle}
          />
          {/* Left gutter 52px = toggle 36 + row gap 8 + crumb padding 8, so page title aligns with breadcrumb text. */}
          <main className="flex w-full flex-1 flex-col py-6 pr-6 pl-[52px] sm:pr-8 sm:pl-[52px]">
            {children}
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
};

export default DashboardShell;
