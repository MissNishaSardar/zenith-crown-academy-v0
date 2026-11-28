import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import MarksEntryGrid, {
  type MarksGridRow,
  type PendingMarkApproval,
} from "@/components/Academics/MarksEntryGrid";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import { can } from "@/lib/auth/permissions";
import { formatHundredths } from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { getFreshRoleContext, requirePermission } from "@/server/guards";
import { getWorkingDayDenominator } from "@/server/academics/attendanceActions";

export const metadata: Metadata = {
  title: "Marks",
};

type SearchParams = {
  examId?: string | string[] | undefined;
  paperId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const ACTIVE_ENROLLMENT = ["ENROLLED", "PROMOTED", "REPEATED"] as const;

const MarksPage = async ({ searchParams }: PageProps) => {
  const session = await requirePermission("academic:view");
  const { active } = await getFreshRoleContext(session.user.id);
  const canWrite = active !== null && can(active, "academic:manage-exams");

  const raw = await searchParams;
  const examParam = firstParam(raw.examId);
  const paperParam = firstParam(raw.paperId);

  const exams = await prisma.exam.findMany({
    include: { year: { select: { name: true } } },
    orderBy: [{ startDate: "desc" }, { id: "asc" }],
    select: undefined,
  });
  const examOptions = exams.map((exam) => ({
    id: exam.id,
    label: `${exam.year.name} plus ${String(exam.name).replace(/_/g, " ")} plus ${exam.startDate.toISOString().slice(0, 10)}`,
  }));

  const selectedExam =
    examParam !== "" ?
      await prisma.exam.findUnique({
        include: {
          papers: {
            include: {
              class: { select: { name: true, order: true } },
              components: true,
              subject: { select: { code: true, name: true } },
            },
            orderBy: [{ date: "asc" }, { id: "asc" }],
          },
          year: { select: { name: true } },
        },
        where: { id: examParam },
      })
    : null;

  const paperOptions =
    selectedExam?.papers.map((paper) => ({
      classId: paper.classId,
      id: paper.id,
      label: `${paper.subject.name} (${paper.subject.code}) plus ${paper.class.name} plus ${paper.date.toISOString().slice(0, 10)}`,
    })) ?? [];

  const selectedPaper =
    paperParam !== "" ?
      await prisma.examPaper.findUnique({
        include: {
          class: { select: { name: true, order: true } },
          components: true,
          exam: { include: { year: { select: { name: true } } } },
          subject: { select: { code: true, name: true } },
        },
        where: { id: paperParam },
      })
    : null;

  let gridRows: MarksGridRow[] = [];
  let pending: PendingMarkApproval[] = [];
  let paperInfo: {
    className: string;
    components: { kind: string; maxMarks: string; passMarks: string }[];
    date: string;
    durationMin: number;
    examName: string;
    examStatus: string;
    id: string;
    isLocked: boolean;
    maxMarks: string;
    passMarks: string;
    subjectName: string;
    yearName: string;
  } | null = null;

  if (selectedPaper) {
    paperInfo = {
      className: selectedPaper.class.name,
      components: selectedPaper.components.map((component) => ({
        kind: String(component.kind),
        maxMarks: formatHundredths(component.maxHundredths),
        passMarks: formatHundredths(component.passHundredths),
      })),
      date: selectedPaper.date.toISOString().slice(0, 10),
      durationMin: selectedPaper.durationMin,
      examName: String(selectedPaper.exam.name).replace(/_/g, " "),
      examStatus: String(selectedPaper.exam.status),
      id: selectedPaper.id,
      isLocked:
        selectedPaper.exam.status === "LOCKED" ||
        selectedPaper.exam.status === "FINALIZED",
      maxMarks: formatHundredths(selectedPaper.maxHundredths),
      passMarks: formatHundredths(selectedPaper.passHundredths),
      subjectName: `${selectedPaper.subject.name} (${selectedPaper.subject.code})`,
      yearName: selectedPaper.exam.year.name,
    };
    const enrollments = await prisma.enrollment.findMany({
      include: {
        picks: { select: { subjectId: true } },
        section: { select: { name: true } },
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ sectionId: "asc" }, { rollNo: "asc" }, { id: "asc" }],
      where: {
        classId: selectedPaper.classId,
        status: { in: [...ACTIVE_ENROLLMENT] },
        yearId: selectedPaper.exam.yearId,
      },
    });
    const classLink = await prisma.classSubject.findUnique({
      where: {
        classId_subjectId: {
          classId: selectedPaper.classId,
          subjectId: selectedPaper.subjectId,
        },
      },
    });
    const streamRows = await prisma.streamSubject.findMany({
      select: { streamId: true },
      where: { subjectId: selectedPaper.subjectId },
    });
    const streamsWithSubject = new Set(streamRows.map((row) => row.streamId));
    const scoped = enrollments.filter((row) => {
      if (selectedPaper.exam.streamId) {
        if (row.streamId === selectedPaper.exam.streamId) return true;
        return row.picks.some(
          (pick) => pick.subjectId === selectedPaper.subjectId,
        );
      }
      if (selectedPaper.class.order < 14) return true;
      if (classLink && !classLink.isOptional) return true;
      if (row.streamId && streamsWithSubject.has(row.streamId)) return true;
      return row.picks.some(
        (pick) => pick.subjectId === selectedPaper.subjectId,
      );
    });
    const studentIds = scoped.map((row) => row.studentId);
    const marks =
      studentIds.length > 0 ?
        await prisma.mark.findMany({
          where: { paperId: selectedPaper.id, studentId: { in: studentIds } },
        })
      : [];
    const markByStudent = new Map(marks.map((row) => [row.studentId, row]));
    const denominatorResult = await getWorkingDayDenominator({
      yearId: selectedPaper.exam.yearId,
    });
    const denominator =
      denominatorResult.ok ? denominatorResult.denominator : 0;
    const records =
      studentIds.length > 0 ?
        await prisma.attendanceRecord.findMany({
          select: { status: true, studentId: true },
          where: {
            studentId: { in: studentIds },
            yearId: selectedPaper.exam.yearId,
          },
        })
      : [];
    const presentByStudent = new Map<string, number>();
    for (const record of records) {
      if (
        record.status === "PRESENT" ||
        record.status === "LATE" ||
        record.status === "EXCUSED"
      ) {
        presentByStudent.set(
          record.studentId,
          (presentByStudent.get(record.studentId) ?? 0) + 1,
        );
      }
    }
    const exceptions =
      studentIds.length > 0 ?
        await prisma.attendanceException.findMany({
          select: { status: true, studentId: true },
          where: {
            status: "APPROVED",
            studentId: { in: studentIds },
            yearId: selectedPaper.exam.yearId,
          },
        })
      : [];
    const exceptionByStudent = new Set(exceptions.map((row) => row.studentId));
    gridRows = scoped.map((row) => {
      const mark = markByStudent.get(row.studentId);
      const present = presentByStudent.get(row.studentId) ?? 0;
      const rate =
        denominator > 0 ? Math.round((present * 10000) / denominator) : 0;
      const hasException = exceptionByStudent.has(row.studentId);
      return {
        hasException,
        internalMarks:
          mark?.internalHundredths != null ?
            formatHundredths(mark.internalHundredths)
          : "",
        isShortage: denominator > 0 && rate < 7500 && !hasException,
        practicalMarks:
          mark?.practicalHundredths != null ?
            formatHundredths(mark.practicalHundredths)
          : "",
        rateHundredths: rate,
        rollNo: row.rollNo,
        sectionName: row.section.name,
        state: mark ? String(mark.state) : "SCORED",
        status: mark ? String(mark.status) : "DRAFT",
        studentId: row.studentId,
        studentName: `${row.student.firstName} ${row.student.lastName}`,
        theoryMarks:
          mark?.theoryHundredths != null ?
            formatHundredths(mark.theoryHundredths)
          : "",
        totalMarks:
          mark?.totalHundredths != null ?
            formatHundredths(mark.totalHundredths)
          : "",
      };
    });
    const approvals = await prisma.approvalRequest.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      where: { action: { in: ["marks_submit", "marks_reopen"] } },
    });
    pending = approvals
      .filter((approval) => {
        const payload = approval.payload as unknown as Record<string, unknown>;
        return payload?.["paperId"] === selectedPaper.id;
      })
      .slice(0, 5)
      .map((approval) => ({
        action: String(approval.action),
        id: approval.id,
        status: String(approval.status),
      }));
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Marks")} />
      <PageHeader
        subtitle="Scoped entry with whole class block and submit lock"
        title="Marks"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        method="get">
        <Field className="w-full sm:w-72">
          <FieldLabel htmlFor="marks-exam">Exam</FieldLabel>
          <NativeSelect
            defaultValue={examParam || ""}
            id="marks-exam"
            name="examId">
            <NativeSelectOption value="">Pick an exam</NativeSelectOption>
            {examOptions.map((exam) => (
              <NativeSelectOption
                key={exam.id}
                value={exam.id}>
                {exam.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-72">
          <FieldLabel htmlFor="marks-paper">Paper</FieldLabel>
          <NativeSelect
            defaultValue={paperParam || ""}
            id="marks-paper"
            name="paperId"
            disabled={paperOptions.length === 0}>
            <NativeSelectOption value="">Pick a paper</NativeSelectOption>
            {paperOptions.map((paper) => (
              <NativeSelectOption
                key={paper.id}
                value={paper.id}>
                {paper.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit">Load paper</Button>
      </form>
      {selectedPaper && paperInfo ?
        <MarksEntryGrid
          canWrite={canWrite}
          paper={paperInfo}
          pending={pending}
          rows={gridRows}
        />
      : <p className="text-muted-foreground text-sm">
          Pick an exam plus paper to load the entry grid. Entry is scoped to the
          assigned class plus subject plus stream picks. Attendance below 75
          percent shows a flag here but blocks later at promotion.
        </p>
      }
    </div>
  );
};

export default MarksPage;
