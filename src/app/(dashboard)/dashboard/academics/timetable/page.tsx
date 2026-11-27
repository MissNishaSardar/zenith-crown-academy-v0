import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import TimetableGrid from "@/components/Academics/TimetableGrid";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { parseRoleNames } from "@/lib/auth/permissions";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Timetable",
};

type SearchParams = {
  classId?: string | string[] | undefined;
  sectionId?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const TimetablePage = async ({ searchParams }: PageProps) => {
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

  const ready = yearId !== "all" && classId !== "all" && sectionId !== "all";

  const slots =
    ready ?
      await prisma.timetableSlot.findMany({
        include: {
          subject: { select: { code: true, id: true, name: true } },
          teacher: { select: { email: true, id: true, name: true } },
        },
        orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }],
        where: { classId, sectionId, yearId },
      })
    : [];

  const subjects = await prisma.subject.findMany({
    orderBy: [{ code: "asc" }],
    select: { code: true, id: true, name: true },
  });

  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }],
    select: { email: true, id: true, name: true, role: true },
    take: 200,
  });
  const teachers = users
    .filter((user) => {
      const held = parseRoleNames(user.role);
      return (
        held.includes("teacher") ||
        held.includes("principal") ||
        held.includes("vice_principal")
      );
    })
    .map((user) => ({ email: user.email, id: user.id, name: user.name }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Timetable")} />
      <PageHeader
        subtitle="Routine assignments with clash protection and cover"
        title="Timetable"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="timetable-year">Year</FieldLabel>
          <NativeSelect
            defaultValue={yearId}
            id="timetable-year"
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
          <FieldLabel htmlFor="timetable-class">Class</FieldLabel>
          <NativeSelect
            defaultValue={classId}
            id="timetable-class"
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
          <FieldLabel htmlFor="timetable-section">Section</FieldLabel>
          <NativeSelect
            defaultValue={sectionId}
            id="timetable-section"
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
        <Button type="submit">Apply filters</Button>
      </form>
      {!ready ?
        <p className="text-muted-foreground text-sm">
          Pick a year, class, and section to load the grid.
        </p>
      : <TimetableGrid
          classId={classId}
          sectionId={sectionId}
          yearId={yearId}
          slots={slots.map((slot) => ({
            dayOfWeek: slot.dayOfWeek,
            endTime: slot.endTime,
            id: slot.id,
            periodNo: slot.periodNo,
            startTime: slot.startTime,
            subjectId: slot.subject.id,
            subjectName: `${slot.subject.name} (${slot.subject.code})`,
            teacherId: slot.teacher.id,
            teacherName: slot.teacher.name,
          }))}
          subjects={subjects.map((subject) => ({
            id: subject.id,
            label: `${subject.name} (${subject.code})`,
          }))}
          teachers={teachers.map((teacher) => ({
            id: teacher.id,
            label: `${teacher.name} (${teacher.email})`,
          }))}
        />
      }
    </div>
  );
};

export default TimetablePage;
