"use client";

import Image from "next/image";
import Link from "next/link";

import type { Route } from "next";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/shadcnui/sidebar";
import { getNavGroups, isNavItemActive } from "@/lib/navigation";
import { usePathname } from "next/navigation";

type AppSidebarProps = {
  storedRole: string | null | undefined;
};

const AppSidebar = ({ storedRole }: AppSidebarProps) => {
  const pathname = usePathname();
  const groups = getNavGroups(storedRole);
  const { setOpenMobile } = useSidebar();

  const closeMobile = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          aria-label="Zenith Crown Academy home"
          className="flex w-full min-w-0 items-center justify-center gap-2.5 px-1 py-1 group-data-[collapsible=icon]:px-0">
          <span className="relative size-9 shrink-0 group-data-[collapsible=icon]:size-8">
            <Image
              src="/logo-mark.png"
              alt=""
              fill
              sizes="36px"
              className="object-contain"
            />
          </span>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="font-heading block truncate text-base leading-none font-bold tracking-tight">
              Zenith Crown{" "}
              <span className="text-muted-foreground font-semibold">
                Academy
              </span>
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavItemActive(item, pathname);
                  return (
                    <SidebarMenuItem
                      key={`${group.label}-${item.title}-${item.href}`}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.title}
                        render={
                          <Link
                            href={item.href as Route}
                            onClick={closeMobile}
                          />
                        }>
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {item.badge ?
                        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                      : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};

export default AppSidebar;
