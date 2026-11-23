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

const allUserActions = [...statement.user];
const allSessionActions = [...statement.session];

// Technical system administrator. Full user and session control plus school
// config, integrations, backups, audit logs, sessions, classes, and fee
// heads. Academic areas stay view only. No routine academic decisions.
export const administrator = ac.newRole({
  user: allUserActions,
  session: allSessionActions,
  academic: ["view", "view-reports"],
  fees: ["view", "manage"],
  system: ["view", "manage"],
});

// School owner. Non technical business role with read only access across
// every area. Sees users, reports, billing, and settings. Changes nothing
// and performs no academic data entry.
export const owner = ac.newRole({
  user: ["list", "get"],
  session: ["list"],
  academic: ["view", "view-reports"],
  fees: ["view"],
  system: ["view"],
});

// Academic head. Owns curriculum, exams, promotions, teacher assignments,
// and academic reports. User powers cover staff and student records only.
// No role changes, bans, or admin account takeover. Fees and technical
// areas stay view only.
export const principal = ac.newRole({
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
});

// Deputy academic head. Delegated ops only: attendance oversight,
// discipline, and timetable, plus viewing academic reports. Explicitly
// denied curriculum, exams, assignments, promotions, and board exam
// finalization by omission.
export const vicePrincipal = ac.newRole({
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
});

// Only administrator holds privileged actions. The Admin plugin checks action
// membership only, with no role hierarchy. Granting set-role or set-password
// to principal or vice_principal would let them promote any account to
// administrator or take over an administrator account. update is safe without
// set-role, ban, or set-email because the plugin re-checks those actions
// when the payload touches role, banned, or email fields.

// Member roles browse their own dashboard area only in this pass.
export const teacher = ac.newRole({});
export const student = ac.newRole({});
export const parent = ac.newRole({});
export const accountant = ac.newRole({});
export const officeStaff = ac.newRole({});
export const librarian = ac.newRole({});

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
export const parseRoleNames = (
  stored: string | null | undefined,
): RoleName[] => {
  const storedParts = (stored ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return storedParts.flatMap((part) => {
    const normalized = normalizeRolePart(part);
    return normalized ? [normalized] : [];
  });
};

export const firstRoleName = (stored: string | null | undefined): RoleName =>
  parseRoleNames(stored)[0] ?? defaultRole;

export const roleUrlSlug = (role: RoleName): string => roleUrlSlugs[role];

export const resolveRolePath = (role: string | null | undefined): string =>
  `/dashboard/${roleUrlSlugs[firstRoleName(role)]}`;
