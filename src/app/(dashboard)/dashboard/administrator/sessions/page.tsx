import type { Metadata } from "next";
import { headers } from "next/headers";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { auth } from "@/lib/auth";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

import SessionsList from "@/components/Admin/SessionsList";

export const metadata: Metadata = {
  title: "Sessions",
};

const PAGE_SIZE = 10;

type SessionsSearchParams = {
  page?: string | string[] | undefined;
};

type SessionsPageProps = {
  searchParams: Promise<SessionsSearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const SessionsPage = async ({ searchParams }: SessionsPageProps) => {
  await requirePermission("system:manage");
  const raw = await searchParams;

  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const now = new Date();

  const total = await prisma.session.count();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const requestHeaders = await headers();
  const current = await auth.api
    .getSession({ headers: requestHeaders })
    .catch(() => null);
  const currentSessionId = current?.session.id ?? null;

  const sessions = await prisma.session.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      createdAt: true,
      expiresAt: true,
      id: true,
      ipAddress: true,
      user: {
        select: { email: true, id: true, name: true, role: true },
      },
      userAgent: true,
      userId: true,
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const rows = sessions.map((row) => ({
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    id: row.id,
    ipAddress: row.ipAddress,
    isCurrent: row.id === currentSessionId,
    isExpired: row.expiresAt <= now,
    user: {
      email: row.user.email,
      id: row.user.id,
      name: row.user.name,
      role: row.user.role,
    },
    userAgent: row.userAgent,
    userId: row.userId,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          {
            href: "/dashboard/administrator",
            label: "Administrator workspace",
          },
          { label: "Sessions" },
        ]}
      />
      <PageHeader
        subtitle="View and revoke sign in sessions"
        title="Sessions"
      />
      <SessionsList
        page={page}
        rows={rows}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default SessionsPage;
