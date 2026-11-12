"use server";

import { cache } from "react";
import { headers } from "next/headers";

import type { Prisma } from "@generated/prisma/client";

import { auth } from "@/lib/auth";
import { parseRoleNames } from "@/lib/auth/permissions";
import { isAuditAction, AUDIT_ACTIONS } from "@/lib/auditSeverity";
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

export type AuditLogRow = {
  action: string;
  actorEmail: string;
  actorName: string;
  createdAtIso: string;
  details: string;
  id: string;
  targetEmail: string | null;
  targetName: string | null;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  total: number;
};

export type AuditLogActionFilter = "all" | (typeof AUDIT_ACTIONS)[number];

const MAX_SEARCH_LENGTH = 200;

const isActionFilter = (value: unknown): value is AuditLogActionFilter =>
  value === "all" || isAuditAction(value);

const parseIsoDate = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const listAuditLogs = async ({
  page = 1,
  pageSize = 10,
  action = "all",
  actorSearch = "",
  fromIso,
  toIso,
}: {
  page?: number;
  pageSize?: number;
  action?: AuditLogActionFilter;
  actorSearch?: string;
  fromIso?: string | undefined;
  toIso?: string | undefined;
}): Promise<AuditLogPage> => {
  await requireSuperAdmin();

  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize >= 1 && pageSize <= 100 ?
      Math.floor(pageSize)
    : 10;
  const safeAction = isActionFilter(action) ? action : "all";
  const trimmedSearch =
    typeof actorSearch === "string" ?
      actorSearch.trim().slice(0, MAX_SEARCH_LENGTH)
    : "";
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);

  const where: Prisma.AuditLogWhereInput = {};

  if (safeAction !== "all") {
    where.action = safeAction;
  }

  if (trimmedSearch) {
    where.OR = [
      { actorName: { contains: trimmedSearch } },
      { actorEmail: { contains: trimmedSearch } },
    ];
  }

  if (from && to && from.getTime() > to.getTime()) {
    // Inclusive range must not be empty because of swapped ends.
    where.createdAt = { gte: to, lte: from };
  } else {
    if (from) {
      where.createdAt = { ...where.createdAt, gte: from };
    }
    if (to) {
      where.createdAt = { ...where.createdAt, lte: to };
    }
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
      select: {
        id: true,
        action: true,
        actorName: true,
        actorEmail: true,
        targetName: true,
        targetEmail: true,
        details: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      targetName: row.targetName,
      targetEmail: row.targetEmail,
      details: row.details,
      createdAtIso: row.createdAt.toISOString(),
    })),
  };
};
