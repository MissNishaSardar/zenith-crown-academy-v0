import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import EnrollmentDialog from "@/components/Academics/EnrollmentDialog";
import EnrollmentsDataTable from "@/components/Academics/EnrollmentsDataTable";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import { can } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import { enrollmentStatusNames } from "@/lib/zodSchema";
import { getFreshRoleContext, requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Enrollments",
};

const PAGE_SIZE = 10;

type SearchParams = {
  classId?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sectionId?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  status?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const EnrollmentsPage = async ({ searchParams }: PageProps) => {
  const session = await requirePermission("academic:view");
  const { active } = await getFreshRoleContext(session.user.id);
  const canWrite =
    active !== null &&
    (can(active, "academic:manage-curriculum") ||
      active === "office_staff" ||
      can(active, "system:manage"));
  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 40);
  const yearParam = firstParam(raw.yearId);
  const classParam = firstParam(raw.classId);
  const sectionParam = firstParam(raw.sectionId);
  const statusParam = firstParam(raw.status);
  const status =
    (enrollmentStatusNames as readonly string[]).includes(statusParam) ?
      statusParam
    : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort = sortParam === "rollNo" ? "rollNo" : "createdAt";
  const dir = firstParam(raw.dir) === "asc" ? "asc" : "desc";

  const years = await prisma.academicYear.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, status: true },
  });
  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ order: "asc" }],
    select: { id: true, name: true, order: true },
  });
  const sections = await prisma.section.findMany({
    orderBy: [{ name: "asc" }],
    select: { classId: true, id: true, name: true, yearId: true },
  });
  const students = await prisma.studentProfile.findMany({
    orderBy: [{ admissionNo: "asc" }],
    select: {
      admissionNo: true,
      classId: true,
      firstName: true,
      id: true,
      lastName: true,
      sectionId: true,
      yearId: true,
    },
    take: 200,
  });
  const streams = await prisma.stream.findMany({
    orderBy: [{ name: "asc" }],
    select: { classId: true, id: true, name: true },
  });
  const subjects = await prisma.subject.findMany({
    orderBy: [{ code: "asc" }],
    select: { code: true, id: true, name: true },
  });
  const classSubjects = await prisma.classSubject.findMany({
    select: { classId: true, isOptional: true, subjectId: true },
  });
  const streamSubjects = await prisma.streamSubject.findMany({
    select: { streamId: true, subjectId: true },
  });
  const enrolledPairs = await prisma.enrollment.findMany({
    select: { studentId: true, yearId: true },
  });

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (yearParam && yearParam !== "all") clauses.push({ yearId: yearParam });
  if (classParam && classParam !== "all") clauses.push({ classId: classParam });
  if (sectionParam && sectionParam !== "all") {
    clauses.push({ sectionId: sectionParam });
  }
  if (status !== "all") clauses.push({ status });
  if (search) {
    clauses.push({
      OR: [
        { rollNo: { contains: search } },
        { student: { firstName: { contains: search } } },
        { student: { lastName: { contains: search } } },
        { student: { admissionNo: { contains: search } } },
      ],
    });
  }
  if (clauses.length > 0) where.AND = clauses;

  const total = await prisma.enrollment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const enrollments = await prisma.enrollment.findMany({
    include: {
      class: { select: { name: true, order: true } },
      picks: { select: { id: true } },
      section: { select: { name: true } },
      stream: { select: { name: true } },
      student: {
        select: { admissionNo: true, firstName: true, lastName: true },
      },
      year: { select: { name: true } },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const rows = enrollments.map((enrollment) => ({
    admissionNo: enrollment.student.admissionNo,
    className: enrollment.class.name,
    id: enrollment.id,
    picks: enrollment.picks.length,
    rollNo: enrollment.rollNo,
    sectionName: enrollment.section.name,
    status: enrollment.status,
    streamName: enrollment.stream?.name ?? "None",
    studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
    yearName: enrollment.year.name,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Enrollments")} />
      <PageHeader
        subtitle="Year placements with stream picks, capacity checks, and transfer requests"
        title="Enrollments"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="enrollments-search">Search</FieldLabel>
          <Input
            defaultValue={search}
            id="enrollments-search"
            maxLength={40}
            name="search"
            placeholder="Name, admission or roll number"
            type="search"
          />
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="enrollments-year">Year</FieldLabel>
          <NativeSelect
            defaultValue={yearParam || "all"}
            id="enrollments-year"
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
          <FieldLabel htmlFor="enrollments-class">Class</FieldLabel>
          <NativeSelect
            defaultValue={classParam || "all"}
            id="enrollments-class"
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
          <FieldLabel htmlFor="enrollments-section">Section</FieldLabel>
          <NativeSelect
            defaultValue={sectionParam || "all"}
            id="enrollments-section"
            name="sectionId">
            <NativeSelectOption value="all">All sections</NativeSelectOption>
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
          <FieldLabel htmlFor="enrollments-status">Status</FieldLabel>
          <NativeSelect
            defaultValue={status === "all" ? "all" : status}
            id="enrollments-status"
            name="status">
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {enrollmentStatusNames.map((option) => (
              <NativeSelectOption
                key={option}
                value={option}>
                {option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit">Apply filters</Button>
      </form>
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Transfers and withdrawals run through approvals.
        </p>
        <EnrollmentDialog
          canWrite={canWrite}
          classSubjects={classSubjects}
          classes={classes}
          enrolledPairs={enrolledPairs}
          sections={sections}
          streamSubjects={streamSubjects}
          streams={streams}
          students={students}
          subjects={subjects}
          years={years}
        />
      </div>
      <EnrollmentsDataTable
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

export default EnrollmentsPage;
