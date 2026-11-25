import { createAccessControl } from "better-auth/plugins/access";

// Mirrors the Admin plugin built in resource actions so admin operations stay
// assignable to custom roles. Academy resources carry the delegation
// boundaries for owner, administrator, principal, and vice principal.
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
  academic: [
    "view",
    "view-reports",
    "manage-curriculum",
    "manage-exams",
    "manage-promotions",
    "finalize-exams",
    "manage-assignments",
    "manage-attendance",
    "manage-discipline",
    "manage-timetable",
  ],
  fees: ["view", "manage"],
  system: ["view", "manage"],
} as const;

export const ac = createAccessControl(statement);

type Statement = typeof statement;

type RoleStatement = {
  [K in keyof Statement]?: Statement[K][number][];
};

type RoleKey =
  | "owner"
  | "administrator"
  | "principal"
  | "vice_principal"
  | "teacher"
  | "student"
  | "parent"
  | "accountant"
  | "office_staff"
  | "librarian";

// Canonical role statements. Single edit point for both Better Auth
// access control and the app level permission strings below.
const ROLE_STATEMENTS: Record<RoleKey, RoleStatement> = {
  // Technical system administrator. Full user and session control plus school
  // config, integrations, backups, audit logs, sessions, classes, and fee
  // heads. Academic areas stay view only. No routine academic decisions.
  administrator: {
    user: [...statement.user],
    session: [...statement.session],
    academic: ["view", "view-reports"],
    fees: ["view", "manage"],
    system: ["view", "manage"],
  },
  // School owner. Non technical business role with read only access across
  // every area. Sees users, reports, billing, and settings. Changes nothing
  // and performs no academic data entry.
  owner: {
    user: ["list", "get"],
    session: ["list"],
    academic: ["view", "view-reports"],
    fees: ["view"],
    system: ["view"],
  },
  // Academic head. Owns curriculum, exams, promotions, teacher assignments,
  // and academic reports. User powers cover staff and student records only.
  // No role changes, bans, or admin account takeover. Fees and technical
  // areas stay view only.
  principal: {
    user: ["create", "list", "get", "update"],
    session: ["list"],
    academic: [
      "view",
      "view-reports",
      "manage-curriculum",
      "manage-exams",
      "manage-promotions",
      "finalize-exams",
      "manage-assignments",
      "manage-attendance",
      "manage-discipline",
      "manage-timetable",
    ],
    fees: ["view"],
    system: ["view"],
  },
  // Deputy academic head. Delegated ops only: attendance oversight,
  // discipline, and timetable, plus viewing academic reports. Explicitly
  // denied curriculum, exams, assignments, promotions, and board exam
  // finalization by omission.
  vice_principal: {
    user: ["list", "get", "update"],
    session: ["list"],
    academic: [
      "view",
      "view-reports",
      "manage-attendance",
      "manage-discipline",
      "manage-timetable",
    ],
    fees: ["view"],
    system: ["view"],
  },
  // Member roles browse their own dashboard area only in this pass.
  teacher: {},
  student: {},
  parent: {},
  accountant: {},
  office_staff: {},
  librarian: {},
};

export const administrator = ac.newRole(ROLE_STATEMENTS.administrator);
export const owner = ac.newRole(ROLE_STATEMENTS.owner);
export const principal = ac.newRole(ROLE_STATEMENTS.principal);
export const vicePrincipal = ac.newRole(ROLE_STATEMENTS.vice_principal);

// Only administrator holds privileged actions. The Admin plugin checks action
// membership only, with no role hierarchy. Granting set-role or set-password
// to principal or vice_principal would let them promote any account to
// administrator or take over an administrator account. update is safe without
// set-role, ban, or set-email because the plugin re-checks those actions
// when the payload touches role, banned, or email fields.

// Member roles browse their own dashboard area only in this pass.
export const teacher = ac.newRole(ROLE_STATEMENTS.teacher);
export const student = ac.newRole(ROLE_STATEMENTS.student);
export const parent = ac.newRole(ROLE_STATEMENTS.parent);
export const accountant = ac.newRole(ROLE_STATEMENTS.accountant);
export const officeStaff = ac.newRole(ROLE_STATEMENTS.office_staff);
export const librarian = ac.newRole(ROLE_STATEMENTS.librarian);

export const roles = {
  owner,
  administrator,
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
  "owner",
  "administrator",
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
  owner: "Owner",
  administrator: "Administrator",
  principal: "Principal",
  vice_principal: "Vice principal",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
  accountant: "Accountant",
  office_staff: "Office staff",
  librarian: "Librarian",
};

export const roleDescriptions: Record<RoleName, string> = {
  owner: "Read-only view across the school",
  administrator: "Users, roles, and school configuration",
  principal: "Curriculum, exams, and academic leadership",
  vice_principal: "Attendance, discipline, and timetable",
  teacher: "Teaching and classwork",
  student: "Learning and assignments",
  parent: "Child progress and updates",
  accountant: "Fees and payments",
  office_staff: "Records and front-office tasks",
  librarian: "Catalog and lending",
};

const roleUrlSlugs: Record<RoleName, string> = {
  owner: "owner",
  administrator: "administrator",
  principal: "principal",
  vice_principal: "vice-principal",
  teacher: "teacher",
  student: "student",
  parent: "parent",
  accountant: "accountant",
  office_staff: "office-staff",
  librarian: "librarian",
};

// Legacy slugs map to current roles so existing sessions and stored values
// keep working after the super_admin to administrator rename.
const legacyRoleAliases: Record<string, RoleName> = {
  super_admin: "administrator",
};

const normalizeRolePart = (part: string): RoleName | null => {
  if (roleNames.includes(part as RoleName)) {
    return part as RoleName;
  }
  const aliased = legacyRoleAliases[part];
  if (aliased) {
    return aliased;
  }
  const slugged = (Object.keys(roleUrlSlugs) as RoleName[]).find(
    (role) => roleUrlSlugs[role] === part,
  );
  if (slugged) {
    return slugged;
  }
  console.warn(`Unknown role value ignored: "${part}"`);
  return null;
};

// The role field stores comma separated values when a user holds several roles.
// Order is preserved and duplicates are removed so first role stays primary.
export const parseRoleNames = (
  stored: string | null | undefined,
): RoleName[] => {
  const storedParts = (stored ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const seen = new Set<RoleName>();
  const out: RoleName[] = [];
  for (const part of storedParts) {
    const normalized = normalizeRolePart(part);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
};

// Allowed role combinations. Single roles are always allowed. Only these
// pairs may combine, in either order, with first checked staying primary:
// Parent with Teacher, Office staff, Librarian or Accountant, and Teacher
// with Principal or Vice principal.
const allowedRolePairs: ReadonlySet<string> = new Set([
  "accountant+parent",
  "librarian+parent",
  "office_staff+parent",
  "parent+teacher",
  "principal+teacher",
  "teacher+vice_principal",
]);

export const findIncompatibleRoleCombo = (
  roles: readonly RoleName[],
): string | null => {
  const unique = [...new Set(roles)];
  if (unique.length <= 1) {
    return null;
  }
  if (unique.length === 2) {
    const key = [...unique].sort().join("+");
    if (allowedRolePairs.has(key)) {
      return null;
    }
  }
  if (unique.includes("student")) {
    return "Student cannot be combined with other roles. Use a separate account for staff duties.";
  }
  if (unique.includes("principal") && unique.includes("vice_principal")) {
    return "Principal and Vice principal cannot be held together.";
  }
  if (
    (unique.includes("principal") || unique.includes("vice_principal")) &&
    unique.includes("accountant")
  ) {
    return "Academic leadership cannot be combined with Accountant. Use separate accounts.";
  }
  return "Only single roles or allowed pairs may be used. Allowed pairs are Parent with Teacher, Office staff, Librarian or Accountant, and Teacher with Principal or Vice principal.";
};

export const firstRoleName = (stored: string | null | undefined): RoleName =>
  parseRoleNames(stored)[0] ?? defaultRole;

export const roleUrlSlug = (role: RoleName): string => roleUrlSlugs[role];

export const resolveRolePath = (role: string | null | undefined): string =>
  `/dashboard/${roleUrlSlugs[firstRoleName(role)]}`;

// App level permission strings in singular form so server code matches the
// Better Auth statement without a second vocabulary.
export type Permission = {
  [
    K in keyof typeof statement
  ]: `${K & string}:${(typeof statement)[K][number]}`;
}[keyof typeof statement];

// Derived role to permissions map used by UI filters and server guards.
// Built from ROLE_STATEMENTS so ac roles and string checks cannot drift.
const toPermissions = (role: RoleStatement): Permission[] =>
  (Object.entries(role) as [keyof Statement, string[]][]).flatMap(
    ([resource, actions]) =>
      (actions ?? []).map((action) => `${resource}:${action}` as Permission),
  );

export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  owner: toPermissions(ROLE_STATEMENTS.owner),
  administrator: toPermissions(ROLE_STATEMENTS.administrator),
  principal: toPermissions(ROLE_STATEMENTS.principal),
  vice_principal: toPermissions(ROLE_STATEMENTS.vice_principal),
  teacher: toPermissions(ROLE_STATEMENTS.teacher),
  student: toPermissions(ROLE_STATEMENTS.student),
  parent: toPermissions(ROLE_STATEMENTS.parent),
  accountant: toPermissions(ROLE_STATEMENTS.accountant),
  office_staff: toPermissions(ROLE_STATEMENTS.office_staff),
  librarian: toPermissions(ROLE_STATEMENTS.librarian),
};

// True when any held role grants the permission. Accepts a stored role
// string or a user object so call sites can pass session user directly.
export const can = (
  roleOrUser: string | { role?: string | null | undefined } | null | undefined,
  permission: Permission,
): boolean => {
  const stored = typeof roleOrUser === "string" ? roleOrUser : roleOrUser?.role;
  return parseRoleNames(stored).some((role) =>
    ROLE_PERMISSIONS[role].includes(permission),
  );
};

export const hasPermission = can;
