import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import CalendarList from "@/components/Academics/CalendarList";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Calendar",
};

const PAGE_SIZE = 10;

type SearchParams = {
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  type?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const sortKeys = ["date", "createdAt"] as const;

type SortKey = (typeof sortKeys)[number];

const typeKeys = ["HOLIDAY", "EXAM_BREAK", "WORKING_SATURDAY"] as const;

type TypeKey = (typeof typeKeys)[number];

const typeLabels: Record<TypeKey, string> = {
  EXAM_BREAK: "Exam break",
  HOLIDAY: "Holiday",
  WORKING_SATURDAY: "Working Saturday",
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const isSortKey = (value: string): value is SortKey =>
  (sortKeys as readonly string[]).includes(value);

const isTypeKey = (value: string): value is TypeKey =>
  (typeKeys as readonly string[]).includes(value);

const CalendarPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 100);
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "date";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";
  const typeParam = firstParam(raw.type);
  const type = isTypeKey(typeParam) ? typeParam : "all";

  const years = await prisma.academicYear.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, status: true },
  });
  const currentYear =
    years.find((year) => year.status === "CURRENT") ?? years[0] ?? null;
  const yearParam = firstParam(raw.yearId);
  const yearIds = new Set(years.map((row) => row.id));
  const yearId =
    yearParam && yearIds.has(yearParam) ? yearParam
    : yearParam === "all" ? "all"
    : (currentYear?.id ?? "all");

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (yearId !== "all") {
    clauses.push({ yearId });
  }
  if (type !== "all") {
    clauses.push({ type });
  }
  if (search) {
    clauses.push({ note: { contains: search } });
  }
  if (clauses.length > 0) {
    where.AND = clauses;
  }

  const total = await prisma.workingDay.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const days = await prisma.workingDay.findMany({
    include: { year: { select: { name: true } } },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const rows = days.map((day) => ({
    date: day.date.toISOString().slice(0, 10),
    id: day.id,
    note: day.note ?? "No note",
    type: day.type,
    typeLabel: typeLabels[day.type as TypeKey] ?? day.type.replace("_", " "),
    yearName: day.year.name,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Calendar")} />
      <PageHeader
        subtitle="Holidays, exam breaks and working Saturdays by year"
        title="Calendar"
      />
      <CalendarList
        dir={dir}
        page={page}
        pageSize={PAGE_SIZE}
        rows={rows}
        search={search}
        sort={sort}
        total={total}
        totalPages={totalPages}
        type={type}
        types={typeKeys.map((value) => ({ label: typeLabels[value], value }))}
        yearId={yearId}
        years={years.map((row) => ({ id: row.id, name: row.name }))}
      />
    </div>
  );
};

export default CalendarPage;
