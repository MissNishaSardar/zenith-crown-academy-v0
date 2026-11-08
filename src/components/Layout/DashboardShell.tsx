"use client";

import { SidebarInset, SidebarProvider } from "@/components/shadcnui/sidebar";
import { TooltipProvider } from "@/components/shadcnui/tooltip";
import type { LayoutProps } from "@/lib/types";

import AppSidebar from "./AppSidebar";
import DashboardHeader from "./DashboardHeader";

type DashboardShellProps = LayoutProps & {
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
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar storedRole={storedRole} />
        <SidebarInset>
          <DashboardHeader
            userEmail={userEmail}
            userImage={userImage}
            userName={userName}
            storedRole={storedRole}
          />
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
};

export default DashboardShell;
