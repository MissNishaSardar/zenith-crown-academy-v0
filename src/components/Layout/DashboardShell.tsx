"use client";

import { Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/shadcnui/button";
import { authClient } from "@/lib/auth-client";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { stopImpersonation } from "@/server/admin/sessionActions";
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
  initialImpersonatedBy?: string | null | undefined;
  initialImpersonatedName?: string | null | undefined;
};

const ImpersonationBanner = ({
  initialImpersonatedBy,
  initialImpersonatedName,
}: {
  initialImpersonatedBy?: string | null | undefined;
  initialImpersonatedName?: string | null | undefined;
}) => {
  const { data } = authClient.useSession();
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientImpersonatedBy = (
    data?.session as unknown as
      { impersonatedBy?: string | null | undefined } | undefined
  )?.impersonatedBy;
  // Show the banner when either the server layout or the client session
  // reports impersonation, so a stale or reshaped client session can never
  // silently hide the indicator.
  const impersonatedBy = clientImpersonatedBy ?? initialImpersonatedBy ?? null;
  const impersonatedName =
    data?.user?.name ?? initialImpersonatedName ?? "user";

  if (!impersonatedBy) {
    return null;
  }

  const handleStop = async () => {
    if (isStopping) {
      return;
    }
    setIsStopping(true);
    setError(null);
    const result = await withMinimumLoad(stopImpersonation());
    setIsStopping(false);
    if (!result.ok) {
      setError(result.errors.root ?? "Could not stop impersonation.");
      return;
    }
    window.location.assign("/dashboard");
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      <span>You are impersonating {impersonatedName}.</span>
      {error ?
        <span
          role="alert"
          className="text-destructive">
          {error}
        </span>
      : null}
      <Button
        disabled={isStopping}
        onClick={handleStop}
        size="sm"
        type="button"
        variant="outline">
        {isStopping ?
          <>
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
            />
            Stopping
          </>
        : "Stop impersonating"}
      </Button>
    </div>
  );
};

const DashboardShell = ({
  children,
  storedRole,
  userEmail,
  userImage,
  userName,
  initialImpersonatedBy,
  initialImpersonatedName,
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
      <ImpersonationBanner
        initialImpersonatedBy={initialImpersonatedBy}
        initialImpersonatedName={initialImpersonatedName ?? userName}
      />
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
          {/* Gutters stay 52px on both sides: left matches the header toggle plus gaps plus crumb padding so page title aligns with breadcrumb text, right mirrors it so cards sit centered. */}
          <main className="flex w-full flex-1 flex-col px-[52px] py-6">
            {children}
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
};

export default DashboardShell;
