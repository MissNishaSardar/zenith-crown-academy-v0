import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import SectionsDataTable from "@/components/Academics/SectionsDataTable";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Sections",
};

const PAGE_SIZE = 10;

type SearchParams = {
  classId?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const SectionsPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 40);
  const yearParam = firstParam(raw.yearId);
  const classParam = firstParam(raw.classId);
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort =
    sortParam === "capacity" || sortParam === "name" ? sortParam : "name";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";

  const years = await prisma.academicYear.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, status: true },
  });
  const currentYear =
    years.find((year) => year.status === "CURRENT") ?? years[0] ?? null;
  const yearId = yearParam || currentYear?.id || "all";
  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (yearId !== "all") {
    clauses.push({ yearId });
  }
  if (classParam && classParam !== "all") {
    clauses.push({ classId: classParam });
  }
  if (search) {
    clauses.push({ name: { contains: search } });
  }
  if (clauses.length > 0) {
    where.AND = clauses;
  }

  const total = await prisma.section.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const sections = await prisma.section.findMany({
    include: {
      class: { select: { name: true, order: true } },
      year: { select: { name: true } },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const teacherIds = [
    ...new Set(sections.map((section) => section.classTeacherId)),
  ];
  const teachers =
    teacherIds.length > 0 ?
      await prisma.user.findMany({
        select: { id: true, name: true },
        where: { id: { in: teacherIds } },
      })
    : [];
  const teacherNames = new Map(
    teachers.map((teacher) => [teacher.id, teacher.name]),
  );

  const days =
    yearId !== "all" ?
      await prisma.workingDay.findMany({
        orderBy: [{ date: "asc" }],
        where: { yearId },
      })
    : [];

  const sectionRows = sections.map((section) => ({
    capacity: section.capacity,
    className: section.class.name,
    id: section.id,
    sectionName: section.name,
    teacherName: teacherNames.get(section.classTeacherId) ?? "Unknown",
    yearName: section.year.name,
  }));

  const calendarRows = days.map((day) => ({
    date: day.date.toISOString().slice(0, 10),
    id: day.id,
    note: day.note ?? "",
    type: day.type.replace("_", " "),
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Sections")} />
      <PageHeader
        subtitle="Sections per year and class plus the working day calendar"
        title="Sections"
      />
      <SectionsDataTable
        calendarRows={calendarRows}
        dir={dir}
        page={page}
        rows={sectionRows}
        sort={sort}
        total={total}
        totalPages={totalPages}
        yearId={yearId}
      />
    </div>
  );
};

export default SectionsPage;
