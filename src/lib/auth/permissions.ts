import { createAccessControl } from "better-auth/plugins/access";

// Mirrors the Admin plugin built in resource actions so admin operations stay
// assignable to custom roles. Extend academy resources here as modules grow.
const statement = {
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
} as const;

export const ac = createAccessControl(statement);

const allUserActions = [...statement.user];
const allSessionActions = [...statement.session];

export const superAdmin = ac.newRole({
  user: allUserActions,
  session: allSessionActions,
});

// Only super_admin holds privileged actions. The Admin plugin checks action
// membership only, with no role hierarchy. Granting set-role or set-password
// to principal or vice_principal would let them promote any account to
// super_admin or take over a super_admin account. update is safe without
// set-role, ban, or set-email because the plugin re-checks those actions
// when the payload touches role, banned, or email fields.
export const principal = ac.newRole({
  user: ["create", "list", "get", "update"],
  session: ["list", "revoke"],
});

export const vicePrincipal = ac.newRole({
  user: ["list", "get", "update"],
  session: ["list"],
});

// Member roles browse their own dashboard area only in this pass.
export const teacher = ac.newRole({});
export const student = ac.newRole({});
export const parent = ac.newRole({});
export const accountant = ac.newRole({});
export const officeStaff = ac.newRole({});
export const librarian = ac.newRole({});

export const roles = {
  super_admin: superAdmin,
  principal,
  vice_principal: vicePrincipal,
  teacher,
  student,
  parent,
  accountant,
  office_staff: officeStaff,
  librarian,
} as const;

export type RoleName = keyof typeof roles;

export const roleNames: RoleName[] = [
  "super_admin",
  "principal",
  "vice_principal",
  "teacher",
  "student",
  "parent",
  "accountant",
  "office_staff",
  "librarian",
];

export const defaultRole: RoleName = "student";

export const roleLabels: Record<RoleName, string> = {
  super_admin: "Super admin",
  principal: "Principal",
  vice_principal: "Vice principal",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
  accountant: "Accountant",
  office_staff: "Office staff",
  librarian: "Librarian",
};

const roleUrlSlugs: Record<RoleName, string> = {
  super_admin: "super-admin",
  principal: "principal",
  vice_principal: "vice-principal",
  teacher: "teacher",
  student: "student",
  parent: "parent",
  accountant: "accountant",
  office_staff: "office-staff",
  librarian: "librarian",
};

// The role field stores comma separated values when a user holds several roles.
export const parseRoleNames = (
  stored: string | null | undefined,
): RoleName[] => {
  const storedParts = (stored ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return storedParts.filter((part): part is RoleName =>
    roleNames.includes(part as RoleName),
  );
};

export const firstRoleName = (stored: string | null | undefined): RoleName =>
  parseRoleNames(stored)[0] ?? defaultRole;

export const roleUrlSlug = (role: RoleName): string => roleUrlSlugs[role];

export const resolveRolePath = (role: string | null | undefined): string =>
  `/dashboard/${roleUrlSlugs[firstRoleName(role)]}`;
