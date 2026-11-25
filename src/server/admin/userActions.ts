"use server";

import { headers } from "next/headers";

import { Prisma } from "@generated/prisma/client";

import { auth } from "@/lib/auth";
import { parseRoleNames } from "@/lib/auth/permissions";
import {
  suggestUsernames,
  suggestUsernamesForEdit,
} from "@/lib/admin/usernames";
import prisma from "@/lib/dbClient/prisma";
import {
  createUserSchema,
  setPasswordSchema,
  setRoleSchema,
  updateUserSchema,
  type createUserType,
  type setPasswordType,
  type setRoleType,
  type updateUserType,
} from "@/lib/zodSchema";
import { logAudit, toUserAuditSnapshot } from "@/server/audit";
import { assertPermission } from "@/server/guards";

export type CreateUserResult =
  | {
      user: {
        email: string;
        id: string;
        name: string;
        role: string;
        username: string;
      };
      ok: true;
    }
  | {
      errors: Partial<
        Record<
          "email" | "name" | "password" | "role" | "root" | "username",
          string
        >
      >;
      ok: false;
      suggestions: string[];
    };

export const getUsernameSuggestions = async (
  name: string,
): Promise<{ suggestions: string[] }> => {
  await assertPermission("system:manage");
  const clean = name.trim().slice(0, 100);
  if (clean.length < 2) {
    return { suggestions: [] };
  }
  return { suggestions: await suggestUsernames(clean, prisma) };
};

export const getUsernameSuggestionsForEdit = async (
  name: string,
  userId: string,
): Promise<{ suggestions: string[] }> => {
  await assertPermission("system:manage");
  const clean = name.trim().slice(0, 100);
  const cleanId = userId.trim();
  if (clean.length < 2 || cleanId.length < 1) {
    return { suggestions: [] };
  }
  return {
    suggestions: await suggestUsernamesForEdit(clean, prisma, cleanId),
  };
};

const isOwnerStoredRole = (stored: string | null | undefined): boolean =>
  parseRoleNames(stored).includes("owner");

export type UpdateUserResult =
  | {
      user: {
        email: string;
        id: string;
        name: string;
        username: string;
      };
      ok: true;
    }
  | {
      errors: Partial<Record<"email" | "name" | "root" | "username", string>>;
      ok: false;
      suggestions: string[];
    };

export const updateUser = async (
  input: updateUserType,
): Promise<UpdateUserResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<"email" | "name" | "username", string>> =
      {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "email" || field === "name" || field === "username") &&
        !fieldErrors[field]
      ) {
        fieldErrors[field] = issue.message;
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      return {
        errors: fieldErrors,
        ok: false,
        suggestions: [],
      };
    }
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
      suggestions: [],
    };
  }
  const { email, id, name, username } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id },
  });
  if (!target) {
    return {
      errors: { root: "This user no longer exists." },
      ok: false,
      suggestions: [],
    };
  }
  if (isOwnerStoredRole(target.role)) {
    await logAudit({
      action: "update",
      actor,
      after: { blocked: true, reason: "owner-blocked" },
      before: toUserAuditSnapshot(target),
      entity: "user",
      entityId: target.id,
    });
    return {
      errors: { root: "Owner accounts cannot be changed here." },
      ok: false,
      suggestions: [],
    };
  }

  const emailTaken = await prisma.user.findFirst({
    select: { id: true },
    where: { email, id: { not: id } },
  });
  if (emailTaken) {
    return {
      errors: { email: "This email is already in use." },
      ok: false,
      suggestions: [],
    };
  }

  const usernameTaken = await prisma.user.findFirst({
    select: { id: true },
    where: { id: { not: id }, username },
  });
  if (usernameTaken) {
    return {
      errors: { username: "This username is taken. Pick a suggestion below." },
      ok: false,
      suggestions: await suggestUsernamesForEdit(name, prisma, id),
    };
  }

  try {
    const before = toUserAuditSnapshot(target);
    const row = await prisma.user.update({
      data: { email, emailVerified: true, name, username },
      where: { id },
    });
    await logAudit({
      action: "update",
      actor,
      after: toUserAuditSnapshot(row),
      before,
      entity: "user",
      entityId: row.id,
    });
    return {
      ok: true,
      user: {
        email: row.email,
        id: row.id,
        name: row.name,
        username: row.username ?? "",
      },
    };
  } catch (error) {
    if (isPrismaDuplicate(error)) {
      const targetName = duplicateTarget(error);
      const fresh = await suggestUsernamesForEdit(name, prisma, id);
      if (targetName.includes("username")) {
        return {
          errors: {
            username: "This username was just taken. Pick a suggestion below.",
          },
          ok: false,
          suggestions: fresh,
        };
      }
      if (targetName.includes("email")) {
        return {
          errors: { email: "This email was just used by another account." },
          ok: false,
          suggestions: [],
        };
      }
    }
    return {
      errors: { root: "Could not update this user. Try again." },
      ok: false,
      suggestions: [],
    };
  }
};

export type SetRoleResult =
  | {
      user: { id: string; role: string };
      ok: true;
    }
  | {
      errors: Partial<Record<"role" | "root", string>>;
      ok: false;
    };

export const setRole = async (input: setRoleType): Promise<SetRoleResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const rawRole = (input as { role?: unknown }).role;
  const rawRoles = Array.isArray(rawRole) ? rawRole : [rawRole];
  if (rawRoles.includes("owner")) {
    await logAudit({
      action: "set-role",
      actor,
      after: { blocked: true, reason: "owner-role-blocked" },
      before: null,
      entity: "user",
      entityId: typeof input.id === "string" ? input.id : null,
    });
    return {
      errors: { role: "The owner role cannot be assigned here." },
      ok: false,
    };
  }

  const parsed = setRoleSchema.safeParse(input);
  if (!parsed.success) {
    const roleMessage = parsed.error.issues.find(
      (issue) => issue.path[0] === "role",
    )?.message;
    if (roleMessage) {
      return {
        errors: { role: roleMessage },
        ok: false,
      };
    }
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
    };
  }
  const { id, role: parsedRole } = parsed.data;
  const roles = [
    ...new Set(Array.isArray(parsedRole) ? parsedRole : [parsedRole]),
  ];
  const roleValue = roles.join(",");

  const target = await prisma.user.findUnique({
    where: { id },
  });
  if (!target) {
    return {
      errors: { root: "This user no longer exists." },
      ok: false,
    };
  }
  if (isOwnerStoredRole(target.role)) {
    await logAudit({
      action: "set-role",
      actor,
      after: { blocked: true, reason: "owner-blocked" },
      before: toUserAuditSnapshot(target),
      entity: "user",
      entityId: target.id,
    });
    return {
      errors: { root: "Owner accounts cannot be changed here." },
      ok: false,
    };
  }
  if (actor.id === target.id) {
    await logAudit({
      action: "set-role",
      actor,
      after: { blocked: true, reason: "self-role-blocked" },
      before: toUserAuditSnapshot(target),
      entity: "user",
      entityId: target.id,
    });
    return {
      errors: { root: "Use your profile to change your own role." },
      ok: false,
    };
  }
  if (target.role === roleValue) {
    return { ok: true, user: { id: target.id, role: target.role } };
  }

  try {
    const before = toUserAuditSnapshot(target);
    const requestHeaders = await headers();
    await auth.api.setRole({
      body: { role: roles, userId: id },
      headers: requestHeaders,
    });
    await auth.api.revokeUserSessions({
      body: { userId: id },
      headers: requestHeaders,
    });
    const row = await prisma.user.findUniqueOrThrow({
      where: { id },
    });
    await logAudit({
      action: "set-role",
      actor,
      after: toUserAuditSnapshot(row),
      before,
      entity: "user",
      entityId: row.id,
    });
    await logAudit({
      action: "revoke",
      actor,
      after: { reason: "role-change", userId: id },
      before: null,
      entity: "user",
      entityId: id,
    });
    return { ok: true, user: { id: row.id, role: row.role } };
  } catch {
    return {
      errors: { root: "Could not change this role. Try again." },
      ok: false,
    };
  }
};

export type SetPasswordResult =
  | {
      user: { id: string };
      ok: true;
    }
  | {
      errors: Partial<Record<"password" | "root", string>>;
      ok: false;
    };

export const setPassword = async (
  input: setPasswordType,
): Promise<SetPasswordResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
    };
  }
  const { id, password } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id },
  });
  if (!target) {
    return {
      errors: { root: "This user no longer exists." },
      ok: false,
    };
  }
  if (isOwnerStoredRole(target.role)) {
    await logAudit({
      action: "set-password",
      actor,
      after: { blocked: true, reason: "owner-blocked" },
      before: toUserAuditSnapshot(target),
      entity: "user",
      entityId: target.id,
    });
    return {
      errors: { root: "Owner accounts cannot be changed here." },
      ok: false,
    };
  }
  if (actor.id === target.id) {
    await logAudit({
      action: "set-password",
      actor,
      after: { blocked: true, reason: "self-reset-blocked" },
      before: toUserAuditSnapshot(target),
      entity: "user",
      entityId: target.id,
    });
    return {
      errors: { root: "Use your profile to change your own password." },
      ok: false,
    };
  }

  try {
    const before = toUserAuditSnapshot(target);
    const requestHeaders = await headers();
    await auth.api.setUserPassword({
      body: { newPassword: password, userId: id },
      headers: requestHeaders,
    });
    await auth.api.revokeUserSessions({
      body: { userId: id },
      headers: requestHeaders,
    });
    const row = await prisma.user.findUniqueOrThrow({
      where: { id },
    });
    await logAudit({
      action: "set-password",
      actor,
      after: toUserAuditSnapshot(row),
      before,
      entity: "user",
      entityId: row.id,
    });
    await logAudit({
      action: "revoke",
      actor,
      after: { reason: "password-reset", userId: id },
      before: null,
      entity: "user",
      entityId: id,
    });
    return { ok: true, user: { id: row.id } };
  } catch {
    return {
      errors: { root: "Could not reset this password. Try again." },
      ok: false,
    };
  }
};

const isPrismaDuplicate = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

const duplicateTarget = (error: unknown): string => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.join(",").toLowerCase();
    }
  }
  return "";
};

export const createUser = async (
  input: createUserType,
): Promise<CreateUserResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const rawRole = (input as { role?: unknown }).role;
  const rawRolesForCheck = Array.isArray(rawRole) ? rawRole : [rawRole];
  if (rawRolesForCheck.includes("owner")) {
    const rawInput = input as { email?: unknown; name?: unknown };
    await logAudit({
      action: "create",
      actor,
      after: {
        blocked: true,
        email: typeof rawInput.email === "string" ? rawInput.email : "",
        name: typeof rawInput.name === "string" ? rawInput.name : "",
        reason: "owner-role-blocked",
      },
      before: null,
      entity: "user",
    });
    return {
      errors: { role: "The owner role cannot be assigned here." },
      ok: false,
      suggestions: [],
    };
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    const roleMessage = parsed.error.issues.find(
      (issue) => issue.path[0] === "role",
    )?.message;
    if (roleMessage) {
      return {
        errors: { role: roleMessage },
        ok: false,
        suggestions: [],
      };
    }
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
      suggestions: [],
    };
  }
  const { email, name, password, role, username } = parsed.data;
  const rolesForCreate = [...new Set(Array.isArray(role) ? role : [role])];

  const existingEmail = await prisma.user.findFirst({
    select: { id: true },
    where: { email },
  });
  if (existingEmail) {
    return {
      errors: { email: "This email is already in use." },
      ok: false,
      suggestions: [],
    };
  }

  const existingUsername = await prisma.user.findFirst({
    select: { id: true },
    where: { username },
  });
  if (existingUsername) {
    return {
      errors: { username: "This username is taken. Pick a suggestion below." },
      ok: false,
      suggestions: await suggestUsernames(name, prisma),
    };
  }

  try {
    const requestHeaders = await headers();
    const created = await auth.api.createUser({
      body: {
        data: { username },
        email,
        name,
        password,
        role: rolesForCreate,
      },
      headers: requestHeaders,
    });
    const row = await prisma.user.update({
      where: { id: created.user.id },
      data: { emailVerified: true, username },
    });
    await logAudit({
      action: "create",
      actor,
      after: toUserAuditSnapshot(row),
      before: null,
      entity: "user",
      entityId: row.id,
    });
    return {
      ok: true,
      user: {
        email: row.email,
        id: row.id,
        name: row.name,
        role: row.role,
        username: row.username ?? "",
      },
    };
  } catch (error) {
    if (isPrismaDuplicate(error)) {
      const target = duplicateTarget(error);
      const fresh = await suggestUsernames(name, prisma);
      if (target.includes("username")) {
        return {
          errors: {
            username: "This username was just taken. Pick a suggestion below.",
          },
          ok: false,
          suggestions: fresh,
        };
      }
      if (target.includes("email")) {
        return {
          errors: { email: "This email was just used by another account." },
          ok: false,
          suggestions: [],
        };
      }
    }
    return {
      errors: { root: "Could not create this user. Try again." },
      ok: false,
      suggestions: [],
    };
  }
};
