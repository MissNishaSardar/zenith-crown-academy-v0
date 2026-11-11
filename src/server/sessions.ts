"use server";

import { headers } from "next/headers";
import { cache } from "react";

import type { Prisma } from "@generated/prisma/client";

import { auth } from "@/lib/auth";
import { parseRoleNames } from "@/lib/auth/permissions";
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

export type AdminSessionStatus = "all" | "active" | "expired";

export type AdminSessionRow = {
  id: string;
  token: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAtIso: string;
  expiresAtIso: string;
  expired: boolean;
  impersonatedBy: string | null;
};

export type AdminSessionsPage = {
  total: number;
  sessions: AdminSessionRow[];
};

const isStatusFilter = (value: unknown): value is AdminSessionStatus =>
  value === "all" || value === "active" || value === "expired";

const MAX_SEARCH_LENGTH = 200;

export const listAdminSessions = async ({
  page = 1,
  pageSize = 10,
  search = "",
  status = "all",
}: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminSessionStatus;
}): Promise<AdminSessionsPage> => {
  await requireSuperAdmin();

  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize >= 1 && pageSize <= 100 ?
      Math.floor(pageSize)
    : 10;
  const safeStatus = isStatusFilter(status) ? status : "all";
  const trimmedSearch =
    typeof search === "string" ? search.trim().slice(0, MAX_SEARCH_LENGTH) : "";

  const now = new Date();
  const where: Prisma.SessionWhereInput = {};

  if (trimmedSearch) {
    where.user = {
      OR: [
        { name: { contains: trimmedSearch } },
        { email: { contains: trimmedSearch } },
      ],
    };
  }

  if (safeStatus === "active") {
    where.expiresAt = { gt: now };
  } else if (safeStatus === "expired") {
    where.expiresAt = { lte: now };
  }

  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
      select: {
        id: true,
        token: true,
        userId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        impersonatedBy: true,
        user: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),
    prisma.session.count({ where }),
  ]);

  return {
    total,
    sessions: sessions.map((row) => ({
      id: row.id,
      token: row.token,
      userId: row.userId,
      userName: row.user.name,
      userEmail: row.user.email,
      userRole: row.user.role,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAtIso: row.createdAt.toISOString(),
      expiresAtIso: row.expiresAt.toISOString(),
      expired: row.expiresAt.getTime() <= now.getTime(),
      impersonatedBy: row.impersonatedBy,
    })),
  };
};
