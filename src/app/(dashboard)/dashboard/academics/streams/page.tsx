import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import StreamsList from "@/components/Academics/StreamsList";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Streams",
};

const PAGE_SIZE = 10;

type SearchParams = {
  classId?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sort?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const sortKeys = ["name", "createdAt"] as const;

type SortKey = (typeof sortKeys)[number];

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const isSortKey = (value: string): value is SortKey =>
  (sortKeys as readonly string[]).includes(value);

const StreamsPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 100);
  const classParam = firstParam(raw.classId);
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "name";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";

  const streamClasses = await prisma.schoolClass.findMany({
    orderBy: [{ order: "asc" }],
    select: { id: true, name: true, order: true },
    where: { order: { in: [14, 15] } },
  });
  const classIds = new Set(streamClasses.map((row) => row.id));
  const classId = classParam && classIds.has(classParam) ? classParam : "all";

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (search) {
    clauses.push({ name: { contains: search } });
  }
  if (classId !== "all") {
    clauses.push({ classId });
  }
  if (clauses.length > 0) {
    where.AND = clauses;
  }

  const total = await prisma.stream.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const streams = await prisma.stream.findMany({
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    select: {
      class: { select: { name: true } },
      classId: true,
      id: true,
      name: true,
      subjects: { select: { subject: { select: { code: true } } } },
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const rows = streams.map((stream) => {
    const codes = stream.subjects
      .map((link) => link.subject.code)
      .sort((left, right) => left.localeCompare(right));
    return {
      classId: stream.classId,
      className: stream.class.name,
      id: stream.id,
      name: stream.name,
      subjectCount: codes.length,
      subjectNames: codes.length > 0 ? codes.join(", ") : "No mapped subjects",
    };
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Streams")} />
      <PageHeader
        subtitle="Class 11 and 12 tracks with mapped subjects"
        title="Streams"
      />
      <StreamsList
        classId={classId}
        classes={streamClasses.map((row) => ({ id: row.id, name: row.name }))}
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

export default StreamsPage;
