import type { LucideIcon } from "lucide-react";
import {
  Backpack,
  BookOpen,
  Briefcase,
  Calculator,
  Crown,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  Library,
  ShieldCheck,
  Users,
} from "lucide-react";

import type { Route } from "next";
import {
  can,
  defaultRole,
  firstRoleName,
  parseRoleNames,
  roleLabels,
  roleUrlSlug,
  type Permission,
  type RoleName,
} from "@/lib/auth/permissions";

export type DashboardLink = {
  href: string;
  icon: LucideIcon;
  label: string;
  requiredPermission?: Permission;
};

const roleIcons: Record<RoleName, LucideIcon> = {
  owner: Crown,
  administrator: ShieldCheck,
  principal: GraduationCap,
  vice_principal: Users,
  teacher: BookOpen,
  student: Backpack,
  parent: HeartHandshake,
  accountant: Calculator,
  office_staff: Briefcase,
  librarian: Library,
};

export const getDashboardLinks = (
  storedRole: string | null | undefined,
): DashboardLink[] => {
  const held = parseRoleNames(storedRole);
  const roles = held.length > 0 ? held : [defaultRole];
  const allLinks: DashboardLink[] = [
    {
      href: "/dashboard",
      icon: LayoutDashboard,
      label: "Dashboard",
    },
    ...roles.map((role) => ({
      href: `/dashboard/${roleUrlSlug(role)}`,
      icon: roleIcons[role],
      label: `${roleLabels[role]} workspace`,
    })),
    {
      href: "/dashboard/administrator/users",
      icon: Users,
      label: "Users",
      requiredPermission: "system:manage",
    },
  ];
  return allLinks.filter(
    (link) =>
      !link.requiredPermission || can(storedRole, link.requiredPermission),
  );
};

export const resolveActiveRole = (
  storedRole: string | null | undefined,
  pathname: string | null,
): RoleName => {
  const fallback = firstRoleName(storedRole);
  if (!pathname) {
    return fallback;
  }
  const segment = pathname.split("/")[2];
  const match = (Object.keys(roleIcons) as RoleName[]).find(
    (role) => roleUrlSlug(role) === segment,
  );
  if (!match) {
    return fallback;
  }
  return parseRoleNames(storedRole).includes(match) ? match : fallback;
};

// String cast bypasses typedRoutes checking, so every slug above must match
// a real route directory under app/(dashboard)/dashboard. A renamed folder
// fails at runtime (404), not at typecheck.
export const dashboardRoute = (href: string): Route => href as Route;
