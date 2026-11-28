import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import ExamsList, {
  type ExamPaperRow,
  type ExamRow,
} from "@/components/Academics/ExamDialog";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import { can } from "@/lib/auth/permissions";
import { examNameLabels, formatHundredths } from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { getFreshRoleContext, requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Exams",
};

const PAGE_SIZE = 10;

type SearchParams = {
  classId?: string | string[] | undefined;
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

const statusOptions = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "LOCKED",
  "FINALIZED",
] as const;

const ExamsPage = async ({ searchParams }: PageProps) => {
  const session = await requirePermission("academic:view");
  const { active } = await getFreshRoleContext(session.user.id);
  const canWrite = active !== null && can(active, "academic:manage-exams");
  const canFinalize = active !== null && can(active, "academic:finalize-exams");

  const raw = await searchParams;
  const yearParam = firstParam(raw.yearId);
  const classParam = firstParam(raw.classId);
  const statusParam = firstParam(raw.status);
  const status =
    (statusOptions as readonly string[]).includes(statusParam) ?
      statusParam
    : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort = sortParam === "name" ? "name" : "startDate";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";

  const years = await prisma.academicYear.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, status: true },
  });
  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ order: "asc" }],
    select: { id: true, name: true, order: true },
  });
  const subjects = await prisma.subject.findMany({
    orderBy: [{ code: "asc" }],
    select: { code: true, id: true, name: true },
  });
  const streams = await prisma.stream.findMany({
    orderBy: [{ name: "asc" }],
    select: { classId: true, id: true, name: true },
  });
  const classSubjects = await prisma.classSubject.findMany({
    select: { classId: true, subjectId: true },
  });
  const streamSubjects = await prisma.streamSubject.findMany({
    select: { streamId: true, subjectId: true },
  });

  const clauses: object[] = [];
  if (yearParam && yearParam !== "all") clauses.push({ yearId: yearParam });
  if (status !== "all") clauses.push({ status: status as never });
  if (classParam && classParam !== "all") {
    clauses.push({ OR: [{ classId: classParam }, { classId: null }] });
  }
  const where: { AND?: object[] } = clauses.length > 0 ? { AND: clauses } : {};

  const total = await prisma.exam.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const exams = await prisma.exam.findMany({
    include: {
      _count: { select: { papers: true } },
      class: { select: { name: true, order: true } },
      stream: { select: { name: true } },
      year: { select: { name: true } },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const examIds = exams.map((row) => row.id);
  const papers =
    examIds.length > 0 ?
      await prisma.examPaper.findMany({
        include: {
          class: { select: { name: true, order: true } },
          components: true,
          exam: { select: { name: true, status: true } },
          subject: { select: { code: true, name: true } },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        where: {
          examId: { in: examIds },
          ...(classParam && classParam !== "all" ?
            { classId: classParam }
          : {}),
        },
      })
    : [];

  let holidayDates: string[] = [];
  if (yearParam && yearParam !== "all") {
    const days = await prisma.workingDay.findMany({
      select: { date: true, type: true },
      where: {
        type: { in: ["HOLIDAY", "EXAM_BREAK"] },
        yearId: yearParam,
      },
    });
    holidayDates = days.map((row) => row.date.toISOString().slice(0, 10));
  }

  const rows: ExamRow[] = exams.map((exam) => ({
    canFinalize,
    canWrite,
    classId: exam.classId,
    className: exam.class?.name ?? "All classes",
    endDate: exam.endDate.toISOString().slice(0, 10),
    id: exam.id,
    isLocked: exam.status === "LOCKED" || exam.status === "FINALIZED",
    name: String(exam.name),
    nameLabel:
      examNameLabels[String(exam.name)] ?? String(exam.name).replace(/_/g, " "),
    paperCount: exam._count.papers,
    startDate: exam.startDate.toISOString().slice(0, 10),
    status: String(exam.status),
    streamId: exam.streamId,
    streamName: exam.stream?.name ?? "No stream",
    yearId: exam.yearId,
    yearName: exam.year.name,
  }));

  const paperRows: ExamPaperRow[] = papers.map((paper) => ({
    canWrite,
    classId: paper.classId,
    className: paper.class.name,
    components: paper.components.map((component) => ({
      kind: String(component.kind),
      maxMarks: formatHundredths(component.maxHundredths),
      passMarks: formatHundredths(component.passHundredths),
    })),
    date: paper.date.toISOString().slice(0, 10),
    durationMin: paper.durationMin,
    examId: paper.examId,
    examName:
      examNameLabels[String(paper.exam.name)] ??
      String(paper.exam.name).replace(/_/g, " "),
    examStatus: String(paper.exam.status),
    id: paper.id,
    isLocked:
      paper.exam.status === "LOCKED" || paper.exam.status === "FINALIZED",
    maxMarks: formatHundredths(paper.maxHundredths),
    passMarks: formatHundredths(paper.passHundredths),
    subjectId: paper.subjectId,
    subjectName: `${paper.subject.name} (${paper.subject.code})`,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Exams")} />
      <PageHeader
        subtitle="Terms with five step lifecycle, thresholds, and practical split"
        title="Exams"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="exams-year">Year</FieldLabel>
          <NativeSelect
            defaultValue={yearParam || "all"}
            id="exams-year"
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
          <FieldLabel htmlFor="exams-class">
            Class, includes school-wide
          </FieldLabel>
          <NativeSelect
            defaultValue={classParam || "all"}
            id="exams-class"
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
          <FieldLabel htmlFor="exams-status">Status</FieldLabel>
          <NativeSelect
            defaultValue={status === "all" ? "all" : status}
            id="exams-status"
            name="status">
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {statusOptions.map((option) => (
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
      <ExamsList
        canWrite={canWrite}
        classes={classes}
        classSubjects={classSubjects}
        dir={dir}
        holidayDates={holidayDates}
        page={page}
        pageSize={PAGE_SIZE}
        papers={paperRows}
        rows={rows}
        sort={sort}
        streamSubjects={streamSubjects}
        streams={streams}
        subjects={subjects}
        total={total}
        totalPages={totalPages}
        years={years}
      />
    </div>
  );
};

export default ExamsPage;
