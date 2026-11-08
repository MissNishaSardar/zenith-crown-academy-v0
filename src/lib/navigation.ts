import {
  Activity,
  Banknote,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarX,
  CircleHelp,
  ClipboardList,
  Database,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Library,
  MessageCircle,
  Receipt,
  Settings,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  parseRoleNames,
  roleUrlSlug,
  type RoleName,
} from "@/lib/auth/permissions";

export type NavItem = {
  badge?: string;
  href: string;
  icon: LucideIcon;
  isOverview?: boolean;
  title: string;
};

const home = (role: RoleName) => `/dashboard/${roleUrlSlug(role)}`;

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const overview = (role: RoleName): NavItem => ({
  href: home(role),
  icon: LayoutDashboard,
  isOverview: true,
  title: "Overview",
});

const link = (
  role: RoleName,
  title: string,
  icon: LucideIcon,
  badge?: string,
): NavItem => ({
  badge,
  href: `${home(role)}/${slug(title)}`,
  icon,
  title,
});

export const generalNavItems: NavItem[] = [
  {
    href: "/dashboard/messages",
    icon: MessageCircle,
    title: "Messages",
    badge: "3",
  },
  { href: "/dashboard/notifications", icon: Bell, title: "Notifications" },
  {
    href: "/dashboard/help-and-support",
    icon: CircleHelp,
    title: "Help and Support",
  },
];

export const navItemsByRole: Record<RoleName, NavItem[]> = {
  super_admin: [
    overview("super_admin"),
    link("super_admin", "Users and Roles", Users),
    link("super_admin", "Sessions", KeyRound),
    link("super_admin", "System Health", Activity),
    link("super_admin", "Backups", Database),
    link("super_admin", "System Settings", Settings),
  ],
  principal: [
    overview("principal"),
    link("principal", "Academic", BookOpen),
    link("principal", "Staff and Users", Users, "New"),
    link("principal", "Fees Summary", Wallet),
    link("principal", "Attendance", CalendarCheck),
    link("principal", "Reports", BarChart3),
    link("principal", "Leave Approvals", CalendarX, "6"),
    link("principal", "System Settings", Settings),
  ],
  vice_principal: [
    overview("vice_principal"),
    link("vice_principal", "Academic", BookOpen),
    link("vice_principal", "Attendance", CalendarCheck),
    link("vice_principal", "Staff", Users),
    link("vice_principal", "Leave Approvals", CalendarX, "6"),
    link("vice_principal", "Reports", BarChart3),
    link("vice_principal", "System Settings", Settings),
  ],
  teacher: [
    overview("teacher"),
    link("teacher", "My Classes", GraduationCap),
    link("teacher", "Attendance", CalendarCheck),
    link("teacher", "Marks", ClipboardList),
    link("teacher", "Leave", CalendarX),
    link("teacher", "Timetable", Calendar),
    link("teacher", "Settings", Settings),
  ],
  student: [
    overview("student"),
    link("student", "Timetable", Calendar),
    link("student", "Attendance", CalendarCheck),
    link("student", "Results", ClipboardList),
    link("student", "Homework", BookOpen, "2"),
    link("student", "Library", Library),
    link("student", "Profile", Settings),
  ],
  parent: [
    overview("parent"),
    link("parent", "My Children", Users),
    link("parent", "Fees", Wallet, "1"),
    link("parent", "Attendance", CalendarCheck),
    link("parent", "Results", BarChart3),
    link("parent", "Leave", CalendarX),
    link("parent", "Messages", MessageCircle),
  ],
  accountant: [
    overview("accountant"),
    link("accountant", "Fees Ledger", Wallet),
    link("accountant", "Fees Collect", Receipt),
    link("accountant", "Expenses", Banknote),
    link("accountant", "Payroll", Users),
    link("accountant", "Reports", BarChart3),
    link("accountant", "Settings", Settings),
  ],
  office_staff: [
    overview("office_staff"),
    link("office_staff", "Fee Counter", Receipt),
    link("office_staff", "Admissions", FileText),
    link("office_staff", "Attendance Desk", CalendarCheck),
    link("office_staff", "Visitor Log", UserCheck),
    link("office_staff", "Messages", MessageCircle),
    link("office_staff", "Settings", Settings),
  ],
  librarian: [
    overview("librarian"),
    link("librarian", "Library", Library),
    link("librarian", "Books", BookMarked),
    link("librarian", "Members", Users),
    link("librarian", "Fines", Wallet),
    link("librarian", "Settings", Settings),
  ],
};

export const getWorkspaceNavItems = (
  storedRole: string | null | undefined,
): NavItem[] => {
  const roles = parseRoleNames(storedRole);
  const merged: NavItem[] = [];
  const seen = new Set<string>();

  roles.forEach((role) => {
    (navItemsByRole[role] ?? []).forEach((item) => {
      if (!seen.has(item.title)) {
        seen.add(item.title);
        merged.push(item);
      }
    });
  });

  return merged;
};

export const getGeneralItems = (
  storedRole?: string | null | undefined,
): NavItem[] => {
  if (storedRole === undefined) {
    return generalNavItems;
  }
  const workspaceTitles = new Set(
    getWorkspaceNavItems(storedRole).map((item) => item.title),
  );
  return generalNavItems.filter((item) => !workspaceTitles.has(item.title));
};

export const getNavItems = (
  storedRole: string | null | undefined,
): NavItem[] => {
  return [...getWorkspaceNavItems(storedRole), ...getGeneralItems(storedRole)];
};

export const isNavItemActive = (item: NavItem, pathname: string): boolean => {
  return pathname === item.href;
};

export type NavGroup = {
  items: NavItem[];
  label: string;
};

export const getNavGroups = (
  storedRole: string | null | undefined,
): NavGroup[] => {
  const workspace = getWorkspaceNavItems(storedRole);
  return [
    { items: workspace, label: "Workspace" },
    { items: getGeneralItems(storedRole), label: "General" },
  ];
};
