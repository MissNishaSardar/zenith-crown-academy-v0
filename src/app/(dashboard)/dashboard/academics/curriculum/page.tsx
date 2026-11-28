import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import CurriculumList, {
  type CurriculumGroup,
  type CurriculumRow,
  type CurriculumStats,
} from "@/components/Academics/CurriculumList";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import { can } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import { parseRoleNames } from "@/lib/auth/permissions";
import { SYSTEM_CURRICULUM_FLOOR } from "@/lib/zodSchema";
import { getFreshRoleContext, requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Curriculum",
};

type SearchParams = {
  classId?: string | string[] | undefined;
  search?: string | string[] | undefined;
  status?: string | string[] | undefined;
  streamId?: string | string[] | undefined;
  subjectId?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const statusOptions = ["all", "below", "meeting", "locked", "school"] as const;

type StatusParam = (typeof statusOptions)[number];

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
  const statusRaw = firstParam(raw.status);
  const status: StatusParam =
    (statusOptions as readonly string[]).includes(statusRaw) ?
      (statusRaw as StatusParam)
    : "all";

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
  if (search) {
    clauses.push({ title: { contains: search } });
  }
  const where = clauses.length > 0 ? { AND: clauses } : {};

  const CURRICULUM_LIMIT = 500;
  const [matchingUnits, units] = await Promise.all([
    prisma.curriculumUnit.count({ where }),
    prisma.curriculumUnit.findMany({
      include: {
        class: { select: { name: true, order: true } },
        stream: { select: { name: true } },
        subject: { select: { code: true, name: true } },
        year: { select: { name: true } },
      },
      orderBy: [
        { class: { order: "asc" } },
        { subject: { name: "asc" } },
        { order: "asc" },
        { id: "asc" },
      ],
      take: CURRICULUM_LIMIT,
      where,
    }),
  ]);
  const truncated = matchingUnits > units.length;

  const minimums = await prisma.curriculumMinimum.findMany({
    select: { classId: true, minUnits: true, subjectId: true, yearId: true },
  });
  const minimumByKey = new Map(
    minimums.map((row) => [
      `${row.yearId}:${row.classId}:${row.subjectId}`,
      row.minUnits,
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
      subjectShort: unit.subject.name,
      subjectCode: unit.subject.code,
      title: unit.title,
      yearId: unit.yearId,
      yearName: unit.year.name,
    };
  });

  const grouped = new Map<string, CurriculumGroup>();
  for (const row of rows) {
    const key = `${row.yearId}:${row.classId}:${row.subjectId}:${row.streamId ?? "none"}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.units.push(row);
      if (row.required > existing.required) existing.required = row.required;
    } else {
      grouped.set(key, {
        classId: row.classId,
        className: row.className,
        classOrder: row.classOrder,
        current: 0,
        key,
        required: row.required,
        streamId: row.streamId,
        streamName: row.streamName,
        subjectCode: row.subjectCode,
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        subjectShort: row.subjectShort,
        units: [row],
        yearId: row.yearId,
        yearName: row.yearName,
      });
    }
  }

  const baseGroups = [...grouped.values()].map((group) => ({
    ...group,
    current: group.units.length,
    units: [...group.units].sort((a, b) => a.order - b.order),
  }));
  baseGroups.sort((a, b) => {
    if (a.classOrder !== b.classOrder) return a.classOrder - b.classOrder;
    if (a.className !== b.className)
      return a.className.localeCompare(b.className);
    if (a.subjectShort !== b.subjectShort)
      return a.subjectShort.localeCompare(b.subjectShort);
    if (a.yearName !== b.yearName) return a.yearName.localeCompare(b.yearName);
    return a.streamName.localeCompare(b.streamName);
  });

  const totalUnits = baseGroups.reduce((sum, group) => sum + group.current, 0);
  const lockedUnits = baseGroups.reduce(
    (sum, group) => sum + group.units.filter((unit) => unit.isLocked).length,
    0,
  );
  const below = baseGroups.filter(
    (group) => group.current < group.required,
  ).length;
  const meeting = baseGroups.filter(
    (group) => group.current >= group.required,
  ).length;
  const selectedYear = years.find((year) => year.id === yearParam);
  const stats: CurriculumStats = {
    below,
    locked: lockedUnits,
    meeting,
    total: totalUnits,
    yearLabel: selectedYear ? selectedYear.name : "All years",
  };

  const filteredGroups = baseGroups
    .map((group) => {
      if (status === "below" && !(group.current < group.required)) return null;
      if (status === "meeting" && !(group.current >= group.required))
        return null;
      if (status === "locked") {
        const lockedOnly = group.units.filter((unit) => unit.isLocked);
        if (lockedOnly.length === 0) return null;
        return { ...group, units: lockedOnly };
      }
      if (status === "school") {
        const schoolOnly = group.units.filter((unit) => !unit.isLocked);
        if (schoolOnly.length === 0) return null;
        return { ...group, units: schoolOnly };
      }
      return group;
    })
    .filter((group) => group !== null);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Curriculum")} />
      <PageHeader
        subtitle="Teaching sequence for each class and subject. Units must reach the minimum before the term can start."
        title="Curriculum"
      />
      <CurriculumList
        canRequest={canRequest}
        canWrite={isManager}
        classes={classes}
        classSubjects={classSubjects}
        groups={filteredGroups}
        initialFilters={{
          classId: classParam || "all",
          search,
          status,
          streamId: streamParam || "all",
          subjectId: subjectParam || "all",
          yearId: yearParam || "all",
        }}
        principalCount={principalCount}
        stats={stats}
        streamSubjects={streamSubjects}
        streams={streams}
        subjects={subjects}
        totalCount={matchingUnits}
        truncated={truncated}
        years={years}
      />
    </div>
  );
};

export default CurriculumPage;
