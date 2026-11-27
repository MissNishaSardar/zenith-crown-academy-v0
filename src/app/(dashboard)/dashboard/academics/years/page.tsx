import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import YearsList from "@/components/Academics/YearsList";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Academic years",
};

const PAGE_SIZE = 10;

type SearchParams = {
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  status?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const sortKeys = [
  "createdAt",
  "endDate",
  "name",
  "startDate",
  "status",
] as const;

type SortKey = (typeof sortKeys)[number];

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const isSortKey = (value: string): value is SortKey =>
  (sortKeys as readonly string[]).includes(value);

const statusOptions = ["UPCOMING", "CURRENT", "CLOSED"] as const;

const YearsPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 100);
  const statusParam = firstParam(raw.status);
  const status =
    (statusOptions as readonly string[]).includes(statusParam) ?
      statusParam
    : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "createdAt";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (search) {
    clauses.push({ name: { contains: search } });
  }
  if (status !== "all") {
    clauses.push({ status });
  }
  if (clauses.length > 0) {
    where.AND = clauses;
  }

  const total = await prisma.academicYear.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const years = await prisma.academicYear.findMany({
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    select: {
      endDate: true,
      id: true,
      name: true,
      startDate: true,
      status: true,
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const rows = years.map((year) => ({
    endDate: year.endDate.toISOString().slice(0, 10),
    id: year.id,
    name: year.name,
    startDate: year.startDate.toISOString().slice(0, 10),
    status: year.status,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Academic years")} />
      <PageHeader
        subtitle="Setup and lifecycle for academic years"
        title="Academic years"
      />
      <YearsList
        dir={dir}
        page={page}
        pageSize={PAGE_SIZE}
        rows={rows}
        search={search}
        sort={sort}
        status={status}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default YearsPage;
