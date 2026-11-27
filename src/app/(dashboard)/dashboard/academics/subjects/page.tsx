import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import SubjectsList from "@/components/Academics/SubjectsList";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Subjects",
};

const PAGE_SIZE = 10;

type SearchParams = {
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sort?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const sortKeys = ["code", "name", "createdAt"] as const;

type SortKey = (typeof sortKeys)[number];

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const isSortKey = (value: string): value is SortKey =>
  (sortKeys as readonly string[]).includes(value);

const SubjectsPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 100);
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "code";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";

  const where =
    search ?
      {
        OR: [{ code: { contains: search } }, { name: { contains: search } }],
      }
    : {};

  const total = await prisma.subject.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const subjects = await prisma.subject.findMany({
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    select: {
      _count: { select: { classLinks: true, streamLinks: true } },
      code: true,
      id: true,
      name: true,
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const rows = subjects.map((subject) => ({
    classCount: subject._count.classLinks,
    code: subject.code,
    id: subject.id,
    name: subject.name,
    streamCount: subject._count.streamLinks,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Subjects")} />
      <PageHeader
        subtitle="Global codes with class links and stream picks"
        title="Subjects"
      />
      <SubjectsList
        dir={dir}
        page={page}
        pageSize={PAGE_SIZE}
        rows={rows}
        search={search}
        sort={sort}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default SubjectsPage;
