import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import prisma from "@/lib/dbClient/prisma";
import {
  firstRoleName,
  parseRoleNames,
  roleNames,
} from "@/lib/auth/permissions";
import { requirePermission } from "@/server/guards";

import type { SortingState } from "@tanstack/react-table";
import type { Prisma } from "@generated/prisma/client";
import UsersDataTable from "@/components/Admin/UsersDataTable";
import UsersToolbar from "@/components/Admin/UsersToolbar";

export const metadata: Metadata = {
  title: "Users",
};

const PAGE_SIZE = 10;

type UsersSearchParams = {
  banned?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  role?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sort?: string | string[] | undefined;
};

type UsersPageProps = {
  searchParams: Promise<UsersSearchParams>;
};

const sortKeys = ["createdAt", "email", "name", "role", "username"] as const;

type SortKey = (typeof sortKeys)[number];

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const isSortKey = (value: string): value is SortKey =>
  (sortKeys as readonly string[]).includes(value);

const isEffectivelyBanned = (
  banned: boolean,
  banExpires: Date | null,
  now: Date,
): boolean => banned && (banExpires === null || banExpires > now);

const UsersPage = async ({ searchParams }: UsersPageProps) => {
  await requirePermission("system:manage");
  const raw = await searchParams;

  const search = firstParam(raw.search).trim().slice(0, 100);
  const roleParam = firstParam(raw.role);
  const role = (roleNames as string[]).includes(roleParam) ? roleParam : "all";
  const bannedParam = firstParam(raw.banned);
  const bannedFilter =
    bannedParam === "banned" || bannedParam === "active" ? bannedParam : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "createdAt";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";
  const sorting: SortingState = [{ desc: dir === "desc", id: sort }];

  const now = new Date();

  const where: Prisma.UserWhereInput = {};
  const clauses: Prisma.UserWhereInput[] = [];

  if (search) {
    clauses.push({
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
        { username: { contains: search } },
      ],
    });
  }
  if (role !== "all") {
    // Role storage is a comma separated list, so match exact plus comma
    // boundaries. Plain contains would confuse principal with vice_principal.
    clauses.push({
      OR: [
        { role },
        { role: { startsWith: `${role},` } },
        { role: { endsWith: `,${role}` } },
        { role: { contains: `,${role},` } },
      ],
    });
  }
  if (bannedFilter === "banned") {
    clauses.push({
      banned: true,
      OR: [{ banExpires: null }, { banExpires: { gt: now } }],
    });
  }
  if (bannedFilter === "active") {
    clauses.push({
      OR: [{ banned: false }, { banExpires: { lte: now } }],
    });
  }
  if (clauses.length > 0) {
    where.AND = clauses;
  }

  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const sortOrders: Record<SortKey, Prisma.UserOrderByWithRelationInput> = {
    createdAt: { createdAt: dir },
    email: { email: dir },
    name: { name: dir },
    role: { role: dir },
    username: { username: dir },
  };

  const users = await prisma.user.findMany({
    where,
    select: {
      banExpires: true,
      banned: true,
      createdAt: true,
      email: true,
      id: true,
      name: true,
      role: true,
      username: true,
    },
    orderBy: [sortOrders[sort], { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const rows = users.map((user) => ({
    createdAt: user.createdAt,
    effectiveBanned: isEffectivelyBanned(user.banned, user.banExpires, now),
    email: user.email,
    id: user.id,
    name: user.name,
    role: firstRoleName(user.role),
    roles: parseRoleNames(user.role),
    username: user.username ?? "",
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          {
            href: "/dashboard/administrator",
            label: "Overview",
          },
          { label: "Users" },
        ]}
      />
      <PageHeader
        subtitle="Search, filter and manage accounts"
        title="Users"
      />
      <UsersToolbar
        initialBanned={bannedFilter}
        initialRole={role}
        initialSearch={search}
      />
      <UsersDataTable
        banned={bannedFilter}
        dir={dir}
        page={page}
        pageSize={PAGE_SIZE}
        role={role}
        rows={rows}
        search={search}
        sort={sort}
        sorting={sorting}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default UsersPage;
