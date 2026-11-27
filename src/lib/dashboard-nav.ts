import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Backpack,
  BookOpen,
  Briefcase,
  Calculator,
  CalendarDays,
  ClipboardCheck,
  Crown,
  GitBranch,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Library,
  ScrollText,
  Settings,
  ShieldCheck,
  UserPlus,
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

export type DashboardGroup = {
  children: DashboardLink[];
  href: string;
  icon: LucideIcon;
  label: string;
};

// Shared academic routes live under dashboard/academics, never duplicated
// per role folder. Nav filters by can so union views stay visible while
// writes stay gated by requireActivePermission. Route entries land in A2.
export const ACADEMICS_BASE = "/dashboard/academics";

export const ACADEMICS_OVERVIEW_HREF = ACADEMICS_BASE;

export const ACADEMICS_LABEL = "Academics";

// String cast bypasses typedRoutes checking, so every slug above must match
// a real route directory under app/(dashboard)/dashboard. A renamed folder
// fails at runtime (404), not at typecheck.
export const dashboardRoute = (href: string): Route => href as Route;

const academicsLinks: DashboardLink[] = [
  {
    href: `${ACADEMICS_BASE}/years`,
    icon: CalendarDays,
    label: "Academic years",
    requiredPermission: "academic:view",
  },
  {
    href: `${ACADEMICS_BASE}/classes`,
    icon: Layers,
    label: "Classes",
    requiredPermission: "academic:view",
  },
  {
    href: `${ACADEMICS_BASE}/sections`,
    icon: LayoutGrid,
    label: "Sections",
    requiredPermission: "academic:view",
  },
  {
    href: `${ACADEMICS_BASE}/subjects`,
    icon: BookOpen,
    label: "Subjects",
    requiredPermission: "academic:view",
  },
  {
    href: `${ACADEMICS_BASE}/streams`,
    icon: GitBranch,
    label: "Streams",
    requiredPermission: "academic:view",
  },
  {
    href: `${ACADEMICS_BASE}/calendar`,
    icon: CalendarDays,
    label: "Calendar",
    requiredPermission: "academic:view",
  },
  {
    href: `${ACADEMICS_BASE}/admissions`,
    icon: UserPlus,
    label: "Admissions",
    requiredPermission: "academic:view",
  },
  {
    href: `${ACADEMICS_BASE}/approvals`,
    icon: ClipboardCheck,
    label: "Approvals",
    requiredPermission: "academic:view",
  },
];

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
      label:
        role === "administrator" ? "Overview" : `${roleLabels[role]} workspace`,
    })),
    {
      href: "/dashboard/administrator/users",
      icon: Users,
      label: "Users",
      requiredPermission: "system:manage",
    },
    {
      href: "/dashboard/administrator/audit",
      icon: ScrollText,
      label: "Audit log",
      requiredPermission: "system:manage",
    },
    {
      href: "/dashboard/administrator/sessions",
      icon: KeyRound,
      label: "Sessions",
      requiredPermission: "system:manage",
    },
    {
      href: "/dashboard/administrator/system",
      icon: Activity,
      label: "System health",
      requiredPermission: "system:view",
    },
    {
      href: "/dashboard/administrator/settings",
      icon: Settings,
      label: "Settings",
      requiredPermission: "system:manage",
    },
    ...academicsLinks,
  ];
  return allLinks.filter(
    (link) =>
      !link.requiredPermission || can(storedRole, link.requiredPermission),
  );
};

export const getAcademicsLinks = (
  storedRole: string | null | undefined,
): DashboardLink[] =>
  academicsLinks.filter(
    (link) =>
      !link.requiredPermission || can(storedRole, link.requiredPermission),
  );

export const getAcademicsGroup = (
  storedRole: string | null | undefined,
): DashboardGroup => ({
  children: getAcademicsLinks(storedRole),
  href: ACADEMICS_OVERVIEW_HREF,
  icon: BookOpen,
  label: ACADEMICS_LABEL,
});

export const isAcademicsHref = (href: string): boolean =>
  href === ACADEMICS_BASE || href.startsWith(`${ACADEMICS_BASE}/`);

export const isAcademicsPath = (pathname: string | null): boolean =>
  pathname === ACADEMICS_BASE ||
  (pathname?.startsWith(`${ACADEMICS_BASE}/`) ?? false);

export const getAcademicsTrail = (
  currentLabel: string,
): { href?: Route; label: string }[] => [
  { href: dashboardRoute("/dashboard"), label: "Dashboard" },
  { href: dashboardRoute(ACADEMICS_OVERVIEW_HREF), label: ACADEMICS_LABEL },
  { label: currentLabel },
];

export const getAcademicsLandingTrail = (): {
  href?: Route;
  label: string;
}[] => [
  { href: dashboardRoute("/dashboard"), label: "Dashboard" },
  { label: ACADEMICS_LABEL },
];

export const resolveActiveRole = (
  storedRole: string | null | undefined,
  pathname: string | null,
  activeRole?: string | null | undefined,
): RoleName => {
  const held = parseRoleNames(storedRole);
  if (activeRole && held.includes(activeRole as RoleName)) {
    return activeRole as RoleName;
  }
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
  return held.includes(match) ? match : fallback;
};
