import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import AssignmentDialog from "@/components/Academics/AssignmentDialog";
import AssignmentsDataTable, {
  type AssignmentExpanded,
  type AssignmentRow,
} from "@/components/Academics/AssignmentsDataTable";
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
import { assignmentStatusNames } from "@/lib/zodSchema";
import { getFreshRoleContext, requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Assignments",
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
  subjectId?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const AssignmentsPage = async ({ searchParams }: PageProps) => {
  const session = await requirePermission("academic:view");
  const { active } = await getFreshRoleContext(session.user.id);
  const isManager =
    active !== null &&
    (can(active, "academic:manage-assignments") ||
      can(active, "academic:manage-curriculum"));

  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 60);
  const yearParam = firstParam(raw.yearId);
  const classParam = firstParam(raw.classId);
  const sectionParam = firstParam(raw.sectionId);
  const subjectParam = firstParam(raw.subjectId);
  const statusParam = firstParam(raw.status);
  const status =
    (assignmentStatusNames as readonly string[]).includes(statusParam) ?
      statusParam
    : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort = sortParam === "dueDate" ? "dueDate" : "title";
  const dir = firstParam(raw.dir) === "desc" ? "desc" : "asc";

  const years = await prisma.academicYear.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, status: true },
  });
  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ order: "asc" }],
    select: { id: true, name: true },
  });
  const sections = await prisma.section.findMany({
    orderBy: [{ name: "asc" }],
    select: { classId: true, id: true, name: true, yearId: true },
  });
  const subjects = await prisma.subject.findMany({
    orderBy: [{ code: "asc" }],
    select: { code: true, id: true, name: true },
  });

  const ownStudent = await prisma.studentProfile.findFirst({
    select: { firstName: true, id: true, lastName: true },
    where: { userId: session.user.id },
  });
  const ownGuardian = await prisma.guardian.findFirst({
    select: { id: true },
    where: { userId: session.user.id },
  });
  const guardianLinks =
    ownGuardian ?
      await prisma.studentGuardianLink.findMany({
        include: {
          student: { select: { firstName: true, id: true, lastName: true } },
        },
        where: { guardianId: ownGuardian.id },
      })
    : [];
  const submitOptions = [
    ...(ownStudent ?
      [
        {
          studentId: ownStudent.id,
          studentName: `${ownStudent.firstName} ${ownStudent.lastName}`,
        },
      ]
    : []),
    ...guardianLinks.map((link) => ({
      studentId: link.student.id,
      studentName: `${link.student.firstName} ${link.student.lastName}`,
    })),
  ];
  const linkedStudentIds = [
    ...new Set(submitOptions.map((row) => row.studentId)),
  ];

  const teacherAssignments = await prisma.teacherAssignment.findMany({
    select: { classId: true, sectionId: true, subjectId: true, yearId: true },
    where: { isActive: true, teacherId: session.user.id },
  });
  const canWrite = isManager || teacherAssignments.length > 0;
  const canGradeBase = isManager || teacherAssignments.length > 0;

  const linkedEnrollments =
    linkedStudentIds.length > 0 ?
      await prisma.enrollment.findMany({
        select: {
          classId: true,
          id: true,
          sectionId: true,
          studentId: true,
          yearId: true,
        },
        where: {
          status: { in: ["ENROLLED", "PROMOTED", "REPEATED"] },
          studentId: { in: linkedStudentIds },
        },
      })
    : [];
  const picksByEnrollment = new Map<string, Set<string>>();
  const compulsoryByClass = new Map<string, Set<string>>();
  if (linkedEnrollments.length > 0) {
    const enrollmentIds = linkedEnrollments.map((row) => row.id);
    const enrollmentPicks = await prisma.enrollmentSubjectPick.findMany({
      select: { enrollmentId: true, subjectId: true },
      where: { enrollmentId: { in: enrollmentIds } },
    });
    for (const pick of enrollmentPicks) {
      const set = picksByEnrollment.get(pick.enrollmentId) ?? new Set<string>();
      set.add(pick.subjectId);
      picksByEnrollment.set(pick.enrollmentId, set);
    }
    const compulsoryRows = await prisma.classSubject.findMany({
      select: { classId: true, subjectId: true },
      where: {
        classId: {
          in: [...new Set(linkedEnrollments.map((row) => row.classId))],
        },
        isOptional: false,
      },
    });
    for (const row of compulsoryRows) {
      const set = compulsoryByClass.get(row.classId) ?? new Set<string>();
      set.add(row.subjectId);
      compulsoryByClass.set(row.classId, set);
    }
  }
  const enrollmentByStudentYear = new Map(
    linkedEnrollments.map((row) => [`${row.studentId}:${row.yearId}`, row]),
  );
  const isStudentAllowedForAssignment = (
    studentId: string,
    assignment: {
      classId: string;
      sectionId: string | null;
      subjectId: string;
      yearId: string;
    },
  ): boolean => {
    const enrollment = enrollmentByStudentYear.get(
      `${studentId}:${assignment.yearId}`,
    );
    if (!enrollment || enrollment.classId !== assignment.classId) return false;
    if (
      assignment.sectionId !== null &&
      enrollment.sectionId !== assignment.sectionId
    )
      return false;
    const allowed = new Set<string>([
      ...(compulsoryByClass.get(enrollment.classId) ?? []),
      ...(picksByEnrollment.get(enrollment.id) ?? []),
    ]);
    if (allowed.size === 0) return true;
    return allowed.has(assignment.subjectId);
  };

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (yearParam && yearParam !== "all") clauses.push({ yearId: yearParam });
  if (classParam && classParam !== "all") clauses.push({ classId: classParam });
  if (sectionParam && sectionParam !== "all") {
    clauses.push({
      OR: [{ sectionId: sectionParam }, { sectionId: null }],
    });
  }
  if (subjectParam && subjectParam !== "all") {
    clauses.push({ subjectId: subjectParam });
  }
  if (status !== "all") clauses.push({ status });
  if (search) {
    clauses.push({ title: { contains: search } });
  }

  if (!isManager) {
    const scopeOr: object[] = [];
    if (linkedEnrollments.length > 0) {
      for (const enrollment of linkedEnrollments) {
        const allowed = new Set<string>([
          ...(compulsoryByClass.get(enrollment.classId) ?? []),
          ...(picksByEnrollment.get(enrollment.id) ?? []),
        ]);
        scopeOr.push({
          classId: enrollment.classId,
          yearId: enrollment.yearId,
          ...(allowed.size > 0 ? { subjectId: { in: [...allowed] } } : {}),
          OR: [{ sectionId: null }, { sectionId: enrollment.sectionId }],
        });
      }
    } else if (linkedStudentIds.length > 0) {
      scopeOr.push({ id: "__none__" });
    }
    for (const ta of teacherAssignments) {
      scopeOr.push({
        classId: ta.classId,
        subjectId: ta.subjectId,
        yearId: ta.yearId,
        ...(ta.sectionId === null ?
          {}
        : { OR: [{ sectionId: null }, { sectionId: ta.sectionId }] }),
      });
    }
    if (scopeOr.length === 0) {
      clauses.push({ id: "__none__" });
    } else if (scopeOr.length === 1 && scopeOr[0]) {
      clauses.push(scopeOr[0] as object);
    } else {
      clauses.push({ OR: scopeOr });
    }
  }
  if (clauses.length > 0) where.AND = clauses;

  const total = await prisma.assignment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const assignments = await prisma.assignment.findMany({
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
      subject: { select: { code: true, name: true } },
      submissions: {
        include: {
          student: { select: { firstName: true, lastName: true } },
        },
      },
      year: { select: { name: true } },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const expandedById: Record<string, AssignmentExpanded> = {};
  const rows: AssignmentRow[] = [];
  for (const assignment of assignments) {
    const covers =
      isManager ||
      teacherAssignments.some(
        (ta) =>
          ta.yearId === assignment.yearId &&
          ta.classId === assignment.classId &&
          ta.subjectId === assignment.subjectId &&
          (ta.sectionId === null ||
            assignment.sectionId === null ||
            ta.sectionId === assignment.sectionId),
      );
    const perAssignmentSubmitOptions = submitOptions.filter((option) =>
      isStudentAllowedForAssignment(option.studentId, {
        classId: assignment.classId,
        sectionId: assignment.sectionId,
        subjectId: assignment.subjectId,
        yearId: assignment.yearId,
      }),
    );
    const visibleSubmissions =
      covers ?
        assignment.submissions
      : assignment.submissions.filter((row) =>
          perAssignmentSubmitOptions.some(
            (option) => option.studentId === row.studentId,
          ),
        );
    rows.push({
      classId: assignment.classId,
      className: assignment.class.name,
      dueDate:
        assignment.dueDate ? assignment.dueDate.toISOString().slice(0, 10) : "",
      id: assignment.id,
      sectionId: assignment.sectionId,
      sectionName: assignment.section?.name ?? "Whole class",
      status: assignment.status,
      subjectId: assignment.subjectId,
      subjectName: `${assignment.subject.name} (${assignment.subject.code})`,
      submissionCount: visibleSubmissions.length,
      title: assignment.title,
      yearId: assignment.yearId,
      yearName: assignment.year.name,
    });
    expandedById[assignment.id] = {
      assignmentId: assignment.id,
      canGrade: covers,
      canSubmit: perAssignmentSubmitOptions.length > 0,
      edit:
        covers ?
          {
            classId: assignment.classId,
            dueDate:
              assignment.dueDate ?
                assignment.dueDate.toISOString().slice(0, 10)
              : "",
            id: assignment.id,
            instructions: assignment.instructions ?? "",
            sectionId: assignment.sectionId,
            status: assignment.status,
            subjectId: assignment.subjectId,
            title: assignment.title,
            yearId: assignment.yearId,
          }
        : null,
      status: assignment.status,
      submissions: visibleSubmissions.map((submission) => ({
        feedback: submission.feedback,
        filePath: submission.filePath,
        gradeLabel: submission.gradeLabel,
        hasFile: Boolean(submission.filePath),
        id: submission.id,
        status: submission.status,
        studentId: submission.studentId,
        studentName: `${submission.student.firstName} ${submission.student.lastName}`,
        text: submission.text,
      })),
      submitOptions: perAssignmentSubmitOptions,
    };
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Assignments")} />
      <PageHeader
        subtitle="Classwork with scoped grading and protected uploads"
        title="Assignments"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="assignments-search">Search</FieldLabel>
          <Input
            defaultValue={search}
            id="assignments-search"
            maxLength={60}
            name="search"
            placeholder="Title contains"
            type="search"
          />
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="assignments-year">Year</FieldLabel>
          <NativeSelect
            defaultValue={yearParam || "all"}
            id="assignments-year"
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
          <FieldLabel htmlFor="assignments-class">Class</FieldLabel>
          <NativeSelect
            defaultValue={classParam || "all"}
            id="assignments-class"
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
          <FieldLabel htmlFor="assignments-section">Section</FieldLabel>
          <NativeSelect
            defaultValue={sectionParam || "all"}
            id="assignments-section"
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
          <FieldLabel htmlFor="assignments-subject">Subject</FieldLabel>
          <NativeSelect
            defaultValue={subjectParam || "all"}
            id="assignments-subject"
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
          <FieldLabel htmlFor="assignments-status">Status</FieldLabel>
          <NativeSelect
            defaultValue={status === "all" ? "all" : status}
            id="assignments-status"
            name="status">
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {assignmentStatusNames.map((option) => (
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
          Parent view is limited to linked students. Whole class covers all
          sections.
        </p>
        <AssignmentDialog
          canWrite={canGradeBase && canWrite}
          classes={classes}
          sections={sections}
          subjects={subjects}
          years={years}
        />
      </div>
      <AssignmentsDataTable
        canWrite={canWrite}
        classes={classes}
        dir={dir}
        expandedById={expandedById}
        page={page}
        rows={rows}
        sections={sections}
        sort={sort}
        subjects={subjects}
        total={total}
        totalPages={totalPages}
        years={years}
      />
    </div>
  );
};

export default AssignmentsPage;
