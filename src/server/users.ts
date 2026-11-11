"use server";

import { headers } from "next/headers";
import { cache } from "react";

import type { Prisma } from "@generated/prisma/client";

import { auth } from "@/lib/auth";
import {
  parseRoleNames,
  roleNames,
  roleTokenWhere,
  type RoleName,
} from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";

const getSession = cache(async () => {
  const requestHeaders = await headers();
  return auth.api.getSession({ headers: requestHeaders });
});

const requireSuperAdmin = async () => {
  const session = await getSession();
  if (!session || !parseRoleNames(session.user.role).includes("super_admin")) {
    throw new Error("Not authorized");
  }
};

export type AdminUserStatus = "all" | "active" | "banned";

export type AdminUserRoleFilter = "all" | RoleName;

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpiresIso: string | null;
  createdAtIso: string;
};

export type AdminUsersPage = {
  total: number;
  users: AdminUserRow[];
};

const isRoleFilter = (value: unknown): value is AdminUserRoleFilter =>
  value === "all" ||
  (typeof value === "string" &&
    (roleNames as readonly string[]).includes(value));

const isStatusFilter = (value: unknown): value is AdminUserStatus =>
  value === "all" || value === "active" || value === "banned";

const MAX_SEARCH_LENGTH = 200;

export type AdminUserSortBy = "createdAt" | "name";

export type AdminUserSortDir = "asc" | "desc";

export const listAdminUsers = async ({
  page = 1,
  pageSize = 10,
  role = "all",
  search = "",
  sortBy = "createdAt",
  sortDir = "desc",
  status = "all",
}: {
  page?: number;
  pageSize?: number;
  role?: AdminUserRoleFilter;
  search?: string;
  sortBy?: AdminUserSortBy;
  sortDir?: AdminUserSortDir;
  status?: AdminUserStatus;
}): Promise<AdminUsersPage> => {
  await requireSuperAdmin();

  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize >= 1 && pageSize <= 100 ?
      Math.floor(pageSize)
    : 10;
  const safeRole = isRoleFilter(role) ? role : "all";
  const safeStatus = isStatusFilter(status) ? status : "all";
  const safeSortBy: AdminUserSortBy = sortBy === "name" ? "name" : "createdAt";
  const safeSortDir: AdminUserSortDir = sortDir === "asc" ? "asc" : "desc";
  const trimmedSearch =
    typeof search === "string" ? search.trim().slice(0, MAX_SEARCH_LENGTH) : "";
  const searchTerm = trimmedSearch.replace(/^@+/, "");

  const where: Prisma.UserWhereInput = {};

  if (searchTerm) {
    where.OR = [
      { name: { contains: searchTerm } },
      { email: { contains: searchTerm } },
      { username: { contains: searchTerm } },
    ];
  }

  if (safeRole !== "all") {
    where.AND = [roleTokenWhere(safeRole)];
  }

  if (safeStatus === "banned") {
    where.banned = true;
  } else if (safeStatus === "active") {
    where.banned = false;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [safeSortBy]: safeSortDir },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        banned: true,
        banReason: true,
        banExpires: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    total,
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpiresIso: user.banExpires ? user.banExpires.toISOString() : null,
      createdAtIso: user.createdAt.toISOString(),
    })),
  };
};

const normalizeUsernameBase = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

export const isUsernameTaken = async ({
  excludeUserId,
  username,
}: {
  excludeUserId?: string;
  username: string;
}): Promise<boolean> => {
  await requireSuperAdmin();

  // The username plugin stores lowercased values, so compare against the
  // normalized form or a differently cased existing username goes unnoticed.
  const trimmed =
    typeof username === "string" ? username.trim().toLowerCase() : "";
  if (!trimmed) {
    return false;
  }

  const existing = await prisma.user.findFirst({
    where: {
      username: { equals: trimmed },
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  return existing !== null;
};

export const suggestUsernames = async ({
  base,
  count = 3,
  excludeUserId,
}: {
  base: string;
  count?: number;
  excludeUserId?: string;
}): Promise<string[]> => {
  await requireSuperAdmin();

  const normalized = normalizeUsernameBase(base);
  if (!normalized || count < 1) {
    return [];
  }

  // The plugin rejects usernames longer than 30 characters.
  const candidates = [
    ...Array.from({ length: 30 }, (_, index) => `${normalized}${index + 1}`),
    ...Array.from({ length: 30 }, (_, index) => `${normalized}_${index + 1}`),
  ].filter((candidate) => candidate.length <= 30);

  const takenRows = await prisma.user.findMany({
    where: {
      username: { in: candidates },
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { username: true },
  });
  const takenSet = new Set(takenRows.map((row) => row.username));

  return candidates
    .filter((candidate) => !takenSet.has(candidate))
    .slice(0, Math.floor(count));
};
