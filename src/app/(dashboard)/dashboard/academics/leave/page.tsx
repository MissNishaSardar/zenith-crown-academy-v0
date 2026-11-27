import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import FilterDatePicker from "@/components/Layout/FilterDatePicker";
import PageHeader from "@/components/Layout/PageHeader";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import LeaveWorkspace from "@/components/Academics/LeaveWorkspace";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import { can } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import { getFreshRoleContext, requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Leave",
};

type SearchParams = {
  date?: string | string[] | undefined;
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  sort?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const PAGE_SIZE = 10;

const sortKeys = ["createdAt", "startDate", "status"] as const;

type SortKey = (typeof sortKeys)[number];

const isSortKey = (value: string): value is SortKey =>
  (sortKeys as readonly string[]).includes(value);

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const todayKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const LeavePage = async ({ searchParams }: PageProps) => {
  const session = await requirePermission("academic:view");
  const { active } = await getFreshRoleContext(session.user.id);
  const raw = await searchParams;
  const staffDate = firstParam(raw.date).trim() || todayKey();
  const sortParam = firstParam(raw.sort).trim();
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "createdAt";
  const dir = firstParam(raw.dir).trim() === "asc" ? "asc" : "desc";
  const parsedPage = Number.parseInt(firstParam(raw.page).trim(), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const canDecide =
    active !== null &&
    (can(active, "academic:manage-attendance") ||
      can(active, "academic:manage-discipline") ||
      can(active, "academic:manage-curriculum"));
  const canMarkStaff =
    active !== null &&
    (active === "office_staff" ||
      can(active, "academic:manage-attendance") ||
      can(active, "academic:manage-discipline") ||
      can(active, "academic:manage-curriculum"));

  const manager =
    canDecide ||
    can(active ?? "", "system:manage") ||
    active === "office_staff";

  const guardian =
    manager ? null : (
      await prisma.guardian.findFirst({ where: { userId: session.user.id } })
    );
  const staffSelf =
    manager ? null : (
      await prisma.staffProfile.findFirst({
        where: { userId: session.user.id },
      })
    );

  let leaveWhere: Record<string, unknown> = {};
  if (manager) {
    leaveWhere = {};
  } else if (guardian) {
    const links = await prisma.studentGuardianLink.findMany({
      select: { studentId: true },
      where: { guardianId: guardian.id },
    });
    leaveWhere = { studentId: { in: links.map((link) => link.studentId) } };
  } else if (staffSelf) {
    leaveWhere = { staffId: staffSelf.id };
  } else {
    leaveWhere = { id: "__none__" };
  }

  const total = await prisma.leaveRequest.count({ where: leaveWhere });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const leaves = await prisma.leaveRequest.findMany({
    include: {
      staff: { select: { firstName: true, lastName: true } },
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where: leaveWhere,
  });

  const staffOptions = await prisma.staffProfile.findMany({
    orderBy: [{ firstName: "asc" }],
    select: { firstName: true, id: true, isActive: true, lastName: true },
    where: { isActive: true },
  });

  let studentOptions: { id: string; label: string }[] = [];
  if (manager) {
    const students = await prisma.studentProfile.findMany({
      orderBy: [{ firstName: "asc" }],
      select: { firstName: true, id: true, lastName: true },
      take: 200,
    });
    studentOptions = students.map((student) => ({
      id: student.id,
      label: `${student.firstName} ${student.lastName}`,
    }));
  } else if (guardian) {
    const links = await prisma.studentGuardianLink.findMany({
      include: {
        student: { select: { firstName: true, id: true, lastName: true } },
      },
      where: { guardianId: guardian.id },
    });
    studentOptions = links.map((link) => ({
      id: link.student.id,
      label: `${link.student.firstName} ${link.student.lastName}`,
    }));
  }

  const target =
    /^\d{4}-\d{2}-\d{2}$/.test(staffDate) ?
      new Date(`${staffDate}T00:00:00Z`)
    : null;
  const staffAttendance =
    target && canMarkStaff ?
      await prisma.staffAttendance.findMany({
        include: { staff: { select: { firstName: true, lastName: true } } },
        where: { date: target },
      })
    : [];

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Leave")} />
      <PageHeader
        subtitle="Parent leave feeds excused marks. Staff leave needs approval."
        title="Leave"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-end"
        method="get">
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="leave-date">Staff date</FieldLabel>
          <FilterDatePicker
            defaultValue={staffDate}
            id="leave-date"
            key={staffDate}
            name="date"
          />
        </Field>
        <Button type="submit">Apply filters</Button>
      </form>
      <LeaveWorkspace
        canDecide={canDecide}
        canMarkStaff={canMarkStaff}
        dir={dir}
        leaves={leaves.map((leave) => ({
          createdAt: leave.createdAt.toISOString().slice(0, 10),
          endDate: leave.endDate.toISOString().slice(0, 10),
          id: leave.id,
          reason: leave.reason,
          startDate: leave.startDate.toISOString().slice(0, 10),
          status: leave.status,
          target: leave.target,
          targetName:
            leave.target === "STUDENT" && leave.student ?
              `${leave.student.firstName} ${leave.student.lastName}`
            : leave.staff ? `${leave.staff.firstName} ${leave.staff.lastName}`
            : leave.target,
        }))}
        page={page}
        pageSize={PAGE_SIZE}
        sort={sort}
        total={total}
        totalPages={totalPages}
        staffAttendance={staffAttendance.map((row) => ({
          date: row.date.toISOString().slice(0, 10),
          staffId: row.staffId,
          staffName: `${row.staff.firstName} ${row.staff.lastName}`,
          status: row.status,
        }))}
        staffDate={staffDate}
        staffOptions={staffOptions.map((staff) => ({
          id: staff.id,
          label: `${staff.firstName} ${staff.lastName}`,
        }))}
        studentOptions={studentOptions}
      />
    </div>
  );
};

export default LeavePage;
