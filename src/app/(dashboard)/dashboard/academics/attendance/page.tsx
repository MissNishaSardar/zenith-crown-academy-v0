import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import FilterDatePicker from "@/components/Layout/FilterDatePicker";
import PageHeader from "@/components/Layout/PageHeader";
import AttendanceGrid from "@/components/Academics/AttendanceGrid";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Attendance",
};

type SearchParams = {
  classId?: string | string[] | undefined;
  date?: string | string[] | undefined;
  sectionId?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const todayKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const AttendancePage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const years = await prisma.academicYear.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, status: true },
  });
  const currentYear =
    years.find((year) => year.status === "CURRENT") ?? years[0] ?? null;
  const yearId = firstParam(raw.yearId) || currentYear?.id || "all";
  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ order: "asc" }],
    select: { id: true, name: true },
  });
  const classId = firstParam(raw.classId) || classes[0]?.id || "all";
  const sections = await prisma.section.findMany({
    orderBy: [{ name: "asc" }],
    select: { classId: true, id: true, name: true, yearId: true },
    where: yearId !== "all" ? { yearId } : undefined,
  });
  const sectionOptions =
    classId !== "all" ?
      sections.filter((section) => section.classId === classId)
    : sections;
  const sectionId = firstParam(raw.sectionId) || sectionOptions[0]?.id || "all";
  const dateParam = firstParam(raw.date).trim() || todayKey();

  const ready =
    yearId !== "all" &&
    classId !== "all" &&
    sectionId !== "all" &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateParam);

  const enrollments =
    ready ?
      await prisma.enrollment.findMany({
        include: {
          student: { select: { firstName: true, id: true, lastName: true } },
        },
        orderBy: [{ rollNo: "asc" }, { id: "asc" }],
        where: {
          classId,
          sectionId,
          status: { in: ["ENROLLED", "PROMOTED", "REPEATED"] },
          yearId,
        },
      })
    : [];

  const target =
    /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ?
      new Date(`${dateParam}T00:00:00Z`)
    : null;
  const records =
    ready && target ?
      await prisma.attendanceRecord.findMany({
        where: { classId, date: target, sectionId, yearId },
      })
    : [];
  const byStudent = new Map(records.map((row) => [row.studentId, row]));
  const initialRows = enrollments.map((enrollment) => {
    const existing = byStudent.get(enrollment.studentId);
    return {
      note: existing?.note ?? "",
      rollNo: enrollment.rollNo,
      status: existing?.status ?? "",
      studentId: enrollment.studentId,
      studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
    };
  });

  const workingDay =
    ready && target ?
      await prisma.workingDay.findUnique({
        where: { yearId_date: { date: target, yearId } },
      })
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Attendance")} />
      <PageHeader
        subtitle="Daily entry by class section with 75 percent working day checks"
        title="Attendance"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="attendance-year">Year</FieldLabel>
          <NativeSelect
            defaultValue={yearId}
            id="attendance-year"
            name="yearId">
            <NativeSelectOption value="all">Pick a year</NativeSelectOption>
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
          <FieldLabel htmlFor="attendance-class">Class</FieldLabel>
          <NativeSelect
            defaultValue={classId}
            id="attendance-class"
            name="classId">
            <NativeSelectOption value="all">Pick a class</NativeSelectOption>
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
          <FieldLabel htmlFor="attendance-section">Section</FieldLabel>
          <NativeSelect
            defaultValue={sectionId}
            id="attendance-section"
            name="sectionId">
            <NativeSelectOption value="all">Pick a section</NativeSelectOption>
            {sectionOptions.map((section) => (
              <NativeSelectOption
                key={section.id}
                value={section.id}>
                {section.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="attendance-date">Date</FieldLabel>
          <FilterDatePicker
            defaultValue={dateParam}
            id="attendance-date"
            key={dateParam}
            name="date"
          />
        </Field>
        <Button type="submit">Apply filters</Button>
      </form>
      {!ready ?
        <p className="text-muted-foreground text-sm">
          Pick a year, class, section, and date to load the day roster.
        </p>
      : <AttendanceGrid
          classId={classId}
          date={dateParam}
          holidayLabel={workingDay ? workingDay.type.replace("_", " ") : null}
          initialRows={initialRows}
          sectionId={sectionId}
          yearId={yearId}
        />
      }
    </div>
  );
};

export default AttendancePage;
