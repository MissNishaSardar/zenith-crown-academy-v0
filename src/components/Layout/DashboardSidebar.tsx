"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { dashboardRoute, type DashboardLink } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

type DashboardSidebarProps = {
  collapsed: boolean;
  links: DashboardLink[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

const SidebarBrand = ({ collapsed }: { collapsed: boolean }) => (
  <Link
    href="/dashboard"
    aria-label="Zenith Crown Academy dashboard home"
    className={cn(
      "flex h-16 min-w-0 shrink-0 items-center gap-2.5",
      collapsed ? "justify-center px-0" : "px-3",
    )}>
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        collapsed && "size-10",
      )}>
      <Image
        src="/logo-mark.png"
        alt=""
        width={954}
        height={561}
        priority
        className={collapsed ? "h-7 w-7 object-contain" : "h-9 w-auto"}
      />
    </span>
    <span
      className={cn(
        "flex min-w-0 flex-col leading-tight",
        collapsed && "sr-only",
      )}>
      <span className="font-heading text-foreground truncate text-sm font-bold tracking-tight">
        Zenith Crown
      </span>
      <span className="text-muted-foreground text-xs font-semibold">
        Academy
      </span>
    </span>
  </Link>
);

const SidebarNav = ({
  collapsed,
  links,
  onNavigate,
}: {
  collapsed: boolean;
  links: DashboardLink[];
  onNavigate?: () => void;
}) => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard sections"
      className="flex w-full flex-col gap-1 px-2">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={dashboardRoute(link.href)}
            aria-current={isActive ? "page" : undefined}
            aria-label={link.label}
            title={collapsed ? link.label : undefined}
            onClick={onNavigate}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive ?
                "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              collapsed && "justify-center px-0",
            )}>
            <Icon
              aria-hidden="true"
              className="size-5 shrink-0"
            />
            <span className={cn("truncate", collapsed && "sr-only")}>
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

const DashboardSidebar = ({
  collapsed,
  links,
  mobileOpen,
  onCloseMobile,
}: DashboardSidebarProps) => (
  <>
    <aside
      className={cn(
        "bg-sidebar border-sidebar-border sticky top-0 hidden h-svh shrink-0 border-r transition-[width] duration-200 md:flex md:flex-col",
        collapsed ? "w-16" : "w-60",
      )}>
      <SidebarBrand collapsed={collapsed} />
      <SidebarNav
        collapsed={collapsed}
        links={links}
      />
    </aside>
    {mobileOpen ?
      <div className="fixed inset-0 z-50 md:hidden">
        <button
          type="button"
          aria-label="Close menu"
          onClick={onCloseMobile}
          className="bg-background/60 absolute inset-0 cursor-pointer backdrop-blur-sm"
        />
        <aside className="bg-sidebar border-sidebar-border absolute inset-y-0 left-0 flex w-60 flex-col border-r">
          <SidebarBrand collapsed={false} />
          <SidebarNav
            collapsed={false}
            links={links}
            onNavigate={onCloseMobile}
          />
        </aside>
      </div>
    : null}
  </>
);

export default DashboardSidebar;
