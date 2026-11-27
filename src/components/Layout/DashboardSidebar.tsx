"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";

import {
  ACADEMICS_LABEL,
  ACADEMICS_OVERVIEW_HREF,
  dashboardRoute,
  isAcademicsHref,
  isAcademicsPath,
  type DashboardLink,
} from "@/lib/dashboard-nav";
import { FALLBACK_SCHOOL_NAME } from "@/lib/school-branding-constants";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/shadcnui/collapsible";
import { Separator } from "@/components/shadcnui/separator";

type DashboardSidebarProps = {
  collapsed: boolean;
  links: DashboardLink[];
  mobileOpen: boolean;
  sidebarLogoSrc: string;
  sidebarSchoolName: string;
  onCloseMobile: () => void;
};

const SidebarBrand = ({
  collapsed,
  logoSrc,
  schoolName,
}: {
  collapsed: boolean;
  logoSrc: string;
  schoolName: string;
}) => {
  const safeName =
    schoolName.trim() === "" ? FALLBACK_SCHOOL_NAME : schoolName.trim();
  const words = safeName.split(/\s+/).filter(Boolean);
  const lastWord = words.length > 1 ? words[words.length - 1] : null;
  const firstPart = words.length > 1 ? words.slice(0, -1).join(" ") : safeName;
  return (
    <Link
      href="/dashboard"
      aria-label={`${safeName} dashboard home`}
      title={safeName}
      className={cn(
        "flex min-h-16 min-w-0 shrink-0 items-center gap-2.5 py-2",
        collapsed ? "justify-center px-0" : "px-3",
      )}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden",
          collapsed && "size-10",
        )}>
        <Image
          src={logoSrc}
          alt=""
          width={954}
          height={561}
          priority
          unoptimized
          className={collapsed ? "h-7 w-7 object-contain" : "h-9 w-auto"}
        />
      </span>
      <span
        className={cn(
          "flex min-w-0 flex-col leading-tight",
          collapsed && "sr-only",
        )}>
        <span className="font-heading text-foreground line-clamp-2 text-sm leading-tight font-bold tracking-tight break-words">
          {firstPart}
        </span>
        {lastWord ?
          <span className="text-muted-foreground line-clamp-1 text-xs font-semibold break-words">
            {lastWord}
          </span>
        : null}
      </span>
    </Link>
  );
};

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
  const [userExpanded, setUserExpanded] = useState(true);
  const [expandedForPathname, setExpandedForPathname] = useState(pathname);
  const pathnameIsAcademics = isAcademicsPath(pathname);
  const standaloneLinks = links.filter((link) => !isAcademicsHref(link.href));
  const academicsLinks = links.filter((link) => isAcademicsHref(link.href));
  // Auto-expand when navigating to an academics page so the active link is
  // visible, but never force it open: the toggle must keep working while
  // staying on the same page. State is adjusted during render on pathname
  // change instead of in an effect to avoid a cascading render.
  if (pathname !== expandedForPathname) {
    setExpandedForPathname(pathname);
    if (pathnameIsAcademics) {
      setUserExpanded(true);
    }
  }
  const groupOpen = userExpanded;

  if (collapsed) {
    const landingActive = pathname === ACADEMICS_OVERVIEW_HREF;
    const renderIconLink = (
      href: string,
      label: string,
      Icon: typeof BookOpen,
      isActive: boolean,
    ) => (
      <Link
        key={href}
        href={dashboardRoute(href)}
        aria-current={isActive ? "page" : undefined}
        aria-label={label}
        title={label}
        onClick={onNavigate}
        className={cn(
          "flex w-full items-center justify-center rounded-md px-0 py-2 text-sm font-medium transition-colors",
          isActive ?
            "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}>
        <Icon
          aria-hidden="true"
          className="size-5 shrink-0"
        />
        <span className="sr-only">{label}</span>
      </Link>
    );
    return (
      <nav
        aria-label="Dashboard sections"
        className="flex w-full flex-col gap-1 px-2">
        {standaloneLinks.map((link) =>
          renderIconLink(
            link.href,
            link.label,
            link.icon,
            pathname === link.href,
          ),
        )}
        {academicsLinks.length > 0 ?
          renderIconLink(
            ACADEMICS_OVERVIEW_HREF,
            ACADEMICS_LABEL,
            BookOpen,
            landingActive,
          )
        : null}
        {academicsLinks.map((link) =>
          renderIconLink(
            link.href,
            link.label,
            link.icon,
            pathname === link.href,
          ),
        )}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Dashboard sections"
      className="flex w-full flex-col gap-1 px-2">
      {standaloneLinks.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={dashboardRoute(link.href)}
            aria-current={isActive ? "page" : undefined}
            aria-label={link.label}
            onClick={onNavigate}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive ?
                "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}>
            <Icon
              aria-hidden="true"
              className="size-5 shrink-0"
            />
            <span className="truncate">{link.label}</span>
          </Link>
        );
      })}
      {academicsLinks.length > 0 ?
        <>
          <Separator className="my-1" />
          <Collapsible
            open={groupOpen}
            onOpenChange={setUserExpanded}
            className="flex w-full flex-col gap-1">
            <div
              className={cn(
                "flex w-full items-center gap-1 rounded-md transition-colors",
                pathnameIsAcademics ?
                  "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}>
              <Link
                href={dashboardRoute(ACADEMICS_OVERVIEW_HREF)}
                aria-current={
                  pathname === ACADEMICS_OVERVIEW_HREF ? "page" : undefined
                }
                aria-label={ACADEMICS_LABEL}
                onClick={onNavigate}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium">
                <BookOpen
                  aria-hidden="true"
                  className="size-5 shrink-0"
                />
                <span className="flex-1 truncate text-left">
                  {ACADEMICS_LABEL}
                </span>
              </Link>
              <CollapsibleTrigger
                aria-label="Toggle Academics section"
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors">
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    groupOpen && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="flex w-full flex-col gap-1 pl-4">
              {academicsLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={dashboardRoute(link.href)}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={link.label}
                    onClick={onNavigate}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive ?
                        "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}>
                    <Icon
                      aria-hidden="true"
                      className="size-5 shrink-0"
                    />
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        </>
      : null}
    </nav>
  );
};

const DashboardSidebar = ({
  collapsed,
  links,
  mobileOpen,
  sidebarLogoSrc,
  sidebarSchoolName,
  onCloseMobile,
}: DashboardSidebarProps) => (
  <>
    <aside
      className={cn(
        "bg-sidebar border-sidebar-border sticky top-0 hidden h-svh shrink-0 border-r transition-[width] duration-200 md:flex md:flex-col",
        collapsed ? "w-16" : "w-60",
      )}>
      <SidebarBrand
        collapsed={collapsed}
        logoSrc={sidebarLogoSrc}
        schoolName={sidebarSchoolName}
      />
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
          <SidebarBrand
            collapsed={false}
            logoSrc={sidebarLogoSrc}
            schoolName={sidebarSchoolName}
          />
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
