import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import DisciplineList from "@/components/Academics/DisciplineList";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { getFreshRoleContext } from "@/server/guards";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Discipline",
};

const PAGE_SIZE = 10;

type SearchParams = {
  category?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  status?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const categoryOptions = [
  "LATE",
  "MISCONDUCT",
  "BULLYING",
  "CHEATING",
  "VANDALISM",
  "ABSENTEEISM",
  "OTHER",
] as const;

const DisciplinePage = async ({ searchParams }: PageProps) => {
  const session = await requirePermission("academic:view");
  const { active } = await getFreshRoleContext(session.user.id);
  const raw = await searchParams;
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
  const categoryParam = firstParam(raw.category);
  const category =
    (categoryOptions as readonly string[]).includes(categoryParam) ?
      categoryParam
    : "all";
  const statusParam = firstParam(raw.status);
  const status =
    statusParam === "OPEN" || statusParam === "CLOSED" ? statusParam : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (yearId !== "all") clauses.push({ yearId });
  if (category !== "all") clauses.push({ category });
  if (status !== "all") clauses.push({ status });
  if (active === "parent") {
    const guardian = await prisma.guardian.findFirst({
      where: { userId: session.user.id },
    });
    if (!guardian) {
      return (
        <div className="flex flex-1 flex-col gap-6">
          <BreadcrumbTrail items={getAcademicsTrail("Discipline")} />
          <PageHeader
            subtitle="Resolution trail with action required to close"
            title="Discipline"
          />
          <p className="text-muted-foreground text-sm">
            No linked students found.
          </p>
        </div>
      );
    }
    const links = await prisma.studentGuardianLink.findMany({
      select: { studentId: true },
      where: { guardianId: guardian.id },
    });
    clauses.push({
      studentId: { in: links.map((link) => link.studentId) },
    });
  }
  if (clauses.length > 0) where.AND = clauses;

  const total = await prisma.disciplineIncident.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const sortParam = firstParam(raw.sort);
  const sort = sortParam === "status" ? "status" : "date";
  const dir = firstParam(raw.dir) === "asc" ? "asc" : "desc";

  const incidents = await prisma.disciplineIncident.findMany({
    include: {
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const rows = incidents.map((incident) => ({
    actionTaken: incident.actionTaken,
    category: incident.category,
    date: incident.date.toISOString().slice(0, 10),
    description: incident.description,
    id: incident.id,
    status: incident.status,
    studentId: incident.studentId,
    studentName: `${incident.student.firstName} ${incident.student.lastName}`,
    yearId: incident.yearId,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Discipline")} />
      <PageHeader
        subtitle="Resolution trail with action required to close"
        title="Discipline"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="discipline-year">Year</FieldLabel>
          <NativeSelect
            defaultValue={yearId}
            id="discipline-year"
            name="yearId">
            <NativeSelectOption value="all">All years</NativeSelectOption>
            {years.map((year) => (
              <NativeSelectOption
                key={year.id}
                value={year.id}>
                {year.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="discipline-category">Category</FieldLabel>
          <NativeSelect
            defaultValue={category}
            id="discipline-category"
            name="category">
            <NativeSelectOption value="all">All categories</NativeSelectOption>
            {categoryOptions.map((option) => (
              <NativeSelectOption
                key={option}
                value={option}>
                {option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="discipline-status">Status</FieldLabel>
          <NativeSelect
            defaultValue={status}
            id="discipline-status"
            name="status">
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            <NativeSelectOption value="OPEN">Open</NativeSelectOption>
            <NativeSelectOption value="CLOSED">Closed</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Button type="submit">Apply filters</Button>
      </form>
      <p className="text-muted-foreground text-sm">
        Parent view is limited to linked students. Close needs action taken.
      </p>
      <DisciplineList
        dir={dir}
        page={page}
        rows={rows}
        sort={sort}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default DisciplinePage;
