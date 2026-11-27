import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import TeachingDataTable from "@/components/Academics/TeachingDataTable";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Teaching",
};

const PAGE_SIZE = 10;

type SearchParams = {
  classId?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  sectionId?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  subjectId?: string | string[] | undefined;
  teacherId?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const TeachingPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const yearParam = firstParam(raw.yearId);
  const classParam = firstParam(raw.classId);
  const sectionParam = firstParam(raw.sectionId);
  const subjectParam = firstParam(raw.subjectId);
  const teacherParam = firstParam(raw.teacherId);
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const years = await prisma.academicYear.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, status: true },
  });
  const currentYear =
    years.find((year) => year.status === "CURRENT") ?? years[0] ?? null;
  const yearId = yearParam || currentYear?.id || "all";
  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ order: "asc" }],
    select: { id: true, name: true },
  });
  const sections = await prisma.section.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, yearId: true },
    where: yearId !== "all" ? { yearId } : undefined,
  });
  const subjects = await prisma.subject.findMany({
    orderBy: [{ code: "asc" }],
    select: { code: true, id: true, name: true },
  });

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (yearId !== "all") clauses.push({ yearId });
  if (classParam && classParam !== "all") clauses.push({ classId: classParam });
  if (sectionParam && sectionParam !== "all" && sectionParam !== "whole") {
    clauses.push({ sectionId: sectionParam });
  }
  if (sectionParam === "whole") clauses.push({ sectionId: null });
  if (subjectParam && subjectParam !== "all") {
    clauses.push({ subjectId: subjectParam });
  }
  if (teacherParam.trim() !== "") {
    clauses.push({
      teacher: {
        OR: [
          { name: { contains: teacherParam.trim() } },
          { email: { contains: teacherParam.trim() } },
        ],
      },
    });
  }
  if (clauses.length > 0) where.AND = clauses;

  const total = await prisma.teacherAssignment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const sortParam = firstParam(raw.sort);
  const sort = sortParam === "teacherName" ? "teacherName" : "createdAt";
  const dir = firstParam(raw.dir) === "asc" ? "asc" : "desc";

  const assignments = await prisma.teacherAssignment.findMany({
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
      subject: { select: { code: true, name: true } },
      teacher: { select: { email: true, name: true } },
      year: { select: { name: true } },
    },
    orderBy:
      sort === "teacherName" ?
        [{ teacher: { name: dir } }, { id: "asc" }]
      : [{ createdAt: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const rows = assignments.map((assignment) => ({
    className: assignment.class.name,
    id: assignment.id,
    isActive: assignment.isActive,
    sectionName: assignment.section?.name ?? "Whole class",
    subjectName: `${assignment.subject.name} (${assignment.subject.code})`,
    teacherName: `${assignment.teacher.name} (${assignment.teacher.email})`,
    yearName: assignment.year.name,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Teaching")} />
      <PageHeader
        subtitle="Subject assignments per year with whole-class cover and ward conflict guard"
        title="Teaching"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="teaching-teacher">Teacher</FieldLabel>
          <Input
            defaultValue={teacherParam}
            id="teaching-teacher"
            maxLength={40}
            name="teacherId"
            placeholder="Name or email"
            type="search"
          />
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="teaching-year">Year</FieldLabel>
          <NativeSelect
            defaultValue={yearId}
            id="teaching-year"
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
          <FieldLabel htmlFor="teaching-class">Class</FieldLabel>
          <NativeSelect
            defaultValue={classParam || "all"}
            id="teaching-class"
            name="classId">
            <NativeSelectOption value="all">All classes</NativeSelectOption>
            {classes.map((schoolClass) => (
              <NativeSelectOption
                key={schoolClass.id}
                value={schoolClass.id}>
                {schoolClass.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="teaching-section">Section</FieldLabel>
          <NativeSelect
            defaultValue={sectionParam || "all"}
            id="teaching-section"
            name="sectionId">
            <NativeSelectOption value="all">All sections</NativeSelectOption>
            <NativeSelectOption value="whole">Whole class</NativeSelectOption>
            {sections.map((section) => (
              <NativeSelectOption
                key={section.id}
                value={section.id}>
                {section.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="teaching-subject">Subject</FieldLabel>
          <NativeSelect
            defaultValue={subjectParam || "all"}
            id="teaching-subject"
            name="subjectId">
            <NativeSelectOption value="all">All subjects</NativeSelectOption>
            {subjects.map((subject) => (
              <NativeSelectOption
                key={subject.id}
                value={subject.id}>
                {`${subject.name} (${subject.code})`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit">Apply filters</Button>
      </form>
      <p className="text-muted-foreground text-sm">
        Manage buttons stay behind academic:manage-curriculum. Null section
        means whole class.
      </p>
      <TeachingDataTable
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

export default TeachingPage;
