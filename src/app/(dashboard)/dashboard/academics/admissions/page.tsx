import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import AdmissionsDataTable from "@/components/Academics/AdmissionsDataTable";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { getChecklistProgress } from "@/lib/zodSchema";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Admissions",
};

const PAGE_SIZE = 10;

type SearchParams = {
  classId?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  search?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  status?: string | string[] | undefined;
  yearId?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const statusOptions = ["PENDING", "ACTIVE", "INACTIVE"] as const;

const payloadText = (payload: unknown, key: string): string => {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
};

const payloadFlag = (payload: unknown, key: string): boolean => {
  if (!payload || typeof payload !== "object") return false;
  return (payload as Record<string, unknown>)[key] === true;
};

const AdmissionsPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const search = firstParam(raw.search).trim().slice(0, 40);
  const statusParam = firstParam(raw.status);
  const status =
    (statusOptions as readonly string[]).includes(statusParam) ?
      statusParam
    : "all";
  const yearParam = firstParam(raw.yearId);
  const classParam = firstParam(raw.classId);
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort = sortParam === "admissionNo" ? "admissionNo" : "createdAt";
  const dir = firstParam(raw.dir) === "asc" ? "asc" : "desc";

  const years = await prisma.academicYear.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true },
  });
  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ order: "asc" }],
    select: { id: true, name: true },
  });

  const where: { AND?: object[] } = {};
  const clauses: object[] = [];
  if (status !== "all") {
    clauses.push({ admissionStatus: status });
  }
  if (yearParam && yearParam !== "all") {
    clauses.push({ yearId: yearParam });
  }
  if (classParam && classParam !== "all") {
    clauses.push({ classId: classParam });
  }
  if (search) {
    clauses.push({
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { admissionNo: { contains: search } },
      ],
    });
  }
  if (clauses.length > 0) {
    where.AND = clauses;
  }

  const total = await prisma.studentProfile.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const students = await prisma.studentProfile.findMany({
    include: {
      class: { select: { name: true, order: true } },
      documents: { select: { status: true } },
      guardianLinks: {
        include: { guardian: { select: { name: true, phone: true } } },
      },
      year: { select: { name: true } },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const admissionApprovals = await prisma.approvalRequest.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      createdAt: true,
      id: true,
      payload: true,
      requestedBy: true,
      status: true,
    },
    take: 10,
    where: { action: "admission" },
  });
  const pendingApprovals = await prisma.approvalRequest.count({
    where: { action: "admission", status: "PENDING" },
  });

  const studentRows = students.map((student) => {
    const progress = getChecklistProgress(student.documents);
    const guardians =
      student.guardianLinks.length > 0 ?
        student.guardianLinks
          .map(
            (link) =>
              `${link.guardian.name}${link.isPrimary ? " (primary)" : ""}`,
          )
          .join(", ")
      : "No guardian linked yet";
    return {
      admissionNo: student.admissionNo,
      className: student.class.name,
      guardians,
      id: student.id,
      percentVerified: progress.percentVerified,
      status: student.admissionStatus,
      studentName: `${student.firstName} ${student.lastName}`,
      total: progress.total,
      verified: progress.verified,
      yearName: student.year.name,
    };
  });

  const approvalRows = admissionApprovals.map((approval) => ({
    admissionNo: payloadText(approval.payload, "admissionNo") || "Pending",
    duplicate: payloadFlag(approval.payload, "duplicateContact"),
    id: approval.id,
    requested: approval.createdAt.toISOString().slice(0, 10),
    status: approval.status,
    wardFlag: payloadFlag(approval.payload, "wardFlag"),
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Admissions")} />
      <PageHeader
        subtitle="Admission queue with guardian links and checklist progress"
        title="Admissions"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-end"
        method="get">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <input
            className="border-input bg-background h-9 rounded-md border px-3"
            defaultValue={search}
            maxLength={40}
            name="search"
            placeholder="Name or admission number"
            type="search"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2"
            defaultValue={status}
            name="status">
            <option value="all">All statuses</option>
            {statusOptions.map((option) => (
              <option
                key={option}
                value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Year</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2"
            defaultValue={yearParam || "all"}
            name="yearId">
            <option value="all">All years</option>
            {years.map((year) => (
              <option
                key={year.id}
                value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Class</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2"
            defaultValue={classParam || "all"}
            name="classId">
            <option value="all">All classes</option>
            {classes.map((schoolClass) => (
              <option
                key={schoolClass.id}
                value={schoolClass.id}>
                {schoolClass.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium"
          type="submit">
          Apply filters
        </button>
      </form>
      <AdmissionsDataTable
        approvalRows={approvalRows}
        dir={dir}
        page={page}
        pendingApprovals={pendingApprovals}
        rows={studentRows}
        sort={sort}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default AdmissionsPage;
