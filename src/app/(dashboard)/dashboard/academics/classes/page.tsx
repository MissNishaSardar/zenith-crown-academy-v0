import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import ClassesList from "@/components/Academics/ClassesList";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Classes",
};

const PAGE_SIZE = 10;

type SearchParams = {
  band?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sort?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const sortKeys = ["name", "order", "band", "createdAt"] as const;

type SortKey = (typeof sortKeys)[number];

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const isSortKey = (value: string): value is SortKey =>
  (sortKeys as readonly string[]).includes(value);

const bandOptions = [
  "PRE_PRIMARY",
  "PRIMARY",
  "MIDDLE",
  "SECONDARY",
  "SENIOR_SECONDARY",
] as const;

const ClassesPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 100);
  const bandParam = firstParam(raw.band);
  const band =
    (bandOptions as readonly string[]).includes(bandParam) ? bandParam : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "order";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (search) {
    clauses.push({ name: { contains: search } });
  }
  if (band !== "all") {
    clauses.push({ band });
  }
  if (clauses.length > 0) {
    where.AND = clauses;
  }

  const total = await prisma.schoolClass.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    select: { band: true, id: true, isActive: true, name: true, order: true },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Classes")} />
      <PageHeader
        subtitle="Fifteen step ladder from Nursery to Class 12"
        title="Classes"
      />
      <ClassesList
        band={band}
        dir={dir}
        page={page}
        pageSize={PAGE_SIZE}
        rows={classes}
        search={search}
        sort={sort}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default ClassesPage;
