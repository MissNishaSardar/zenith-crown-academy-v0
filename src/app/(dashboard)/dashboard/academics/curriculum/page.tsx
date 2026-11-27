import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import CurriculumList, {
  type CurriculumRow,
} from "@/components/Academics/CurriculumList";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import { can, parseRoleNames } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import {
  curriculumSourceNames,
  SYSTEM_CURRICULUM_FLOOR,
} from "@/lib/zodSchema";
import { getFreshRoleContext, requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Curriculum",
};

const PAGE_SIZE = 10;

type SearchParams = {
  classId?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  source?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  streamId?: string | string[] | undefined;
  subjectId?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const CurriculumPage = async ({ searchParams }: PageProps) => {
  const session = await requirePermission("academic:view");
  const { active } = await getFreshRoleContext(session.user.id);
  const isManager =
    active !== null && can(active, "academic:manage-curriculum");
  const canRequest =
    isManager || active === "vice_principal" || active === "teacher";

  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 100);
  const yearParam = firstParam(raw.yearId);
  const classParam = firstParam(raw.classId);
  const subjectParam = firstParam(raw.subjectId);
  const streamParam = firstParam(raw.streamId);
  const sourceParam = firstParam(raw.source);
  const source =
    (curriculumSourceNames as readonly string[]).includes(sourceParam) ?
      sourceParam
    : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort = sortParam === "title" ? "title" : "order";
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

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (yearParam && yearParam !== "all") clauses.push({ yearId: yearParam });
  if (classParam && classParam !== "all") clauses.push({ classId: classParam });
  if (subjectParam && subjectParam !== "all") {
    clauses.push({ subjectId: subjectParam });
  }
  if (streamParam && streamParam !== "all") {
    if (streamParam === "none") {
      clauses.push({ streamId: null });
    } else {
      clauses.push({ streamId: streamParam });
    }
  }
  if (source !== "all") clauses.push({ source });
  if (search) {
    clauses.push({ title: { contains: search } });
  }
  if (clauses.length > 0) where.AND = clauses;

  const total = await prisma.curriculumUnit.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const units = await prisma.curriculumUnit.findMany({
    include: {
      class: { select: { name: true, order: true } },
      stream: { select: { name: true } },
      subject: { select: { code: true, name: true } },
      year: { select: { name: true } },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const minimums = await prisma.curriculumMinimum.findMany({
    select: { classId: true, minUnits: true, subjectId: true, yearId: true },
  });
  const minimumByKey = new Map(
    minimums.map((row) => [
      `${row.yearId}:${row.classId}:${row.subjectId}`,
      row.minUnits,
    ]),
  );

  const counts = await prisma.curriculumUnit.groupBy({
    _count: { _all: true },
    by: ["yearId", "classId", "subjectId"],
    where: (() => {
      // Coverage stays unfiltered by title search so the required floor
      // does not look under-covered while searching.
      const coverageClauses = clauses.filter(
        (clause) => !("title" in (clause as Record<string, unknown>)),
      );
      return coverageClauses.length > 0 ? { AND: coverageClauses } : {};
    })(),
  });
  const countByKey = new Map(
    counts.map((row) => [
      `${row.yearId}:${row.classId}:${row.subjectId}`,
      row._count._all,
    ]),
  );

  const pendingApprovals = await prisma.approvalRequest.findMany({
    select: { id: true, payload: true, status: true },
    where: {
      action: "curriculum_locked_edit",
      status: { in: ["PENDING", "APPROVED"] },
    },
  });
  const approvalByUnit = new Map<string, { id: string; status: string }>();
  for (const approval of pendingApprovals) {
    const payload = approval.payload as unknown as Record<string, unknown>;
    const unitId =
      typeof payload?.["unitId"] === "string" ? payload["unitId"] : null;
    if (unitId)
      approvalByUnit.set(unitId, { id: approval.id, status: approval.status });
  }

  const principalHolders = await prisma.user.findMany({
    select: { id: true, role: true },
  });
  const principalCount = principalHolders.filter((row) =>
    parseRoleNames(row.role).includes("principal"),
  ).length;

  const rows: CurriculumRow[] = units.map((unit) => {
    const key = `${unit.yearId}:${unit.classId}:${unit.subjectId}`;
    const required = Math.max(
      SYSTEM_CURRICULUM_FLOOR,
      minimumByKey.get(key) ?? 0,
    );
    const approval = approvalByUnit.get(unit.id);
    return {
      approvalStatus: approval?.status ?? null,
      canRequest,
      canWrite: isManager,
      classId: unit.classId,
      className: unit.class.name,
      classOrder: unit.class.order,
      current: countByKey.get(key) ?? 0,
      id: unit.id,
      isLocked: unit.source === "CBSE_LOCKED",
      objectives: unit.objectives,
      order: unit.order,
      pendingApprovalId: approval?.id ?? null,
      required,
      source: unit.source,
      streamId: unit.streamId,
      streamName: unit.stream?.name ?? "No stream",
      subjectId: unit.subjectId,
      subjectName: `${unit.subject.name} (${unit.subject.code})`,
      title: unit.title,
      yearId: unit.yearId,
      yearName: unit.year.name,
    };
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Curriculum")} />
      <PageHeader
        subtitle="Units with school control plus CBSE floor and board lock"
        title="Curriculum"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="curriculum-search">Search</FieldLabel>
          <Input
            defaultValue={search}
            id="curriculum-search"
            maxLength={100}
            name="search"
            placeholder="Title contains"
            type="search"
          />
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="curriculum-year">Year</FieldLabel>
          <NativeSelect
            defaultValue={yearParam || "all"}
            id="curriculum-year"
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
          <FieldLabel htmlFor="curriculum-class">Class</FieldLabel>
          <NativeSelect
            defaultValue={classParam || "all"}
            id="curriculum-class"
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
          <FieldLabel htmlFor="curriculum-subject">Subject</FieldLabel>
          <NativeSelect
            defaultValue={subjectParam || "all"}
            id="curriculum-subject"
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
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="curriculum-stream">Stream</FieldLabel>
          <NativeSelect
            defaultValue={streamParam || "all"}
            id="curriculum-stream"
            name="streamId">
            <NativeSelectOption value="all">All streams</NativeSelectOption>
            <NativeSelectOption value="none">No stream</NativeSelectOption>
            {streams.map((stream) => (
              <NativeSelectOption
                key={stream.id}
                value={stream.id}>
                {stream.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="curriculum-source">Source</FieldLabel>
          <NativeSelect
            defaultValue={source === "all" ? "all" : source}
            id="curriculum-source"
            name="source">
            <NativeSelectOption value="all">All sources</NativeSelectOption>
            {curriculumSourceNames.map((option) => (
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
      <CurriculumList
        canWrite={isManager}
        classes={classes}
        classSubjects={classSubjects}
        dir={dir}
        page={page}
        pageSize={PAGE_SIZE}
        principalCount={principalCount}
        rows={rows}
        sort={sort}
        streams={streams}
        streamSubjects={streamSubjects}
        subjects={subjects}
        total={total}
        totalPages={totalPages}
        years={years}
      />
    </div>
  );
};

export default CurriculumPage;
