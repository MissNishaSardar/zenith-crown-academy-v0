"use server";

import { headers } from "next/headers";

import { Prisma } from "@generated/prisma/client";

import { auth } from "@/lib/auth";
import { suggestUsernames } from "@/lib/admin/usernames";
import prisma from "@/lib/dbClient/prisma";
import { createUserSchema, type createUserType } from "@/lib/zodSchema";
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
  if (rawRole === "owner") {
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
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
      suggestions: [],
    };
  }
  const { email, name, password, role, username } = parsed.data;

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
        role,
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
