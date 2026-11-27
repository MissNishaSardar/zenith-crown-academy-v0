import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import ApprovalsDataTable from "@/components/Academics/ApprovalsDataTable";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { APPROVAL_ACTIONS, can } from "@/lib/auth/permissions";
import { approvalStatusNames } from "@/lib/zodSchema";
import { getFreshRoleContext, requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Approvals",
};

const PAGE_SIZE = 10;

type SearchParams = {
  action?: string | string[] | undefined;
  entity?: string | string[] | undefined;
  page?: string | string[] | undefined;
  status?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const toText = (payload: unknown, key: string): string => {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
};

const toFlag = (payload: unknown, key: string): boolean => {
  if (!payload || typeof payload !== "object") return false;
  return (payload as Record<string, unknown>)[key] === true;
};

const ApprovalsPage = async ({ searchParams }: PageProps) => {
  const session = await requirePermission("academic:view");
  const { active } = await getFreshRoleContext(session.user.id);
  const raw = await searchParams;
  const entityParam = firstParam(raw.entity) || "admission";
  const actionParam = firstParam(raw.action) || entityParam || "admission";
  const action =
    (APPROVAL_ACTIONS as readonly string[]).includes(actionParam) ?
      actionParam
    : "admission";
  const statusParam = firstParam(raw.status);
  const status =
    (approvalStatusNames as readonly string[]).includes(statusParam) ?
      statusParam
    : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const isRedacted = active === "administrator";
  let canReview = active !== null && can(active, "academic:manage-curriculum");
  if (!canReview && active) {
    const now = new Date();
    const delegations = await prisma.delegation.findMany({
      where: { toId: session.user.id },
    });
    canReview = delegations.some(
      (row) =>
        (row.scope === "admission" || row.scope === "*") &&
        row.startAt <= now &&
        row.endAt >= now,
    );
  }

  const where: { action: string; status?: string } =
    status === "all" ? { action } : { action, status };

  const total = await prisma.approvalRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const approvals = await prisma.approvalRequest.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      createdAt: true,
      id: true,
      payload: true,
      reason: true,
      requestedBy: true,
      status: true,
    },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const studentIds = approvals
    .map((row) => toText(row.payload, "studentId"))
    .filter((id) => id !== "");
  const students =
    studentIds.length > 0 ?
      await prisma.studentProfile.findMany({
        select: {
          admissionNo: true,
          class: { select: { name: true } },
          firstName: true,
          id: true,
          lastName: true,
          year: { select: { name: true } },
        },
        where: { id: { in: [...new Set(studentIds)] } },
      })
    : [];
  const studentMap = new Map(
    students.map((row) => [
      row.id,
      {
        admissionNo: row.admissionNo,
        className: row.class.name,
        name: `${row.firstName} ${row.lastName}`,
        yearName: row.year.name,
      },
    ]),
  );

  const pendingCount = await prisma.approvalRequest.count({
    where: { action: "admission", status: "PENDING" },
  });

  const tableRows = approvals.map((approval) => {
    const studentId = toText(approval.payload, "studentId");
    const resolved = studentMap.get(studentId);
    const admissionNo =
      toText(approval.payload, "admissionNo") ||
      resolved?.admissionNo ||
      "Pending";
    return {
      admissionNo,
      canReview,
      className: isRedacted ? "Redacted" : (resolved?.className ?? "Pending"),
      duplicateContact: toFlag(approval.payload, "duplicateContact"),
      id: approval.id,
      isRedacted,
      requested: approval.createdAt.toISOString().slice(0, 10),
      status: approval.status,
      studentName: isRedacted ? "Redacted" : (resolved?.name ?? "Pending"),
      wardFlag: toFlag(approval.payload, "wardFlag"),
      yearName: isRedacted ? "Redacted" : (resolved?.yearName ?? "Pending"),
    };
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Approvals")} />
      <PageHeader
        subtitle="Admission review queue with Class 6 gate and one time invite"
        title="Approvals"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-end"
        method="get">
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="approvals-entity">Entity</FieldLabel>
          <NativeSelect
            defaultValue={entityParam}
            id="approvals-entity"
            name="entity">
            <NativeSelectOption value="admission">Admission</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="approvals-action">Action</FieldLabel>
          <NativeSelect
            defaultValue={action}
            id="approvals-action"
            name="action">
            {APPROVAL_ACTIONS.map((option) => (
              <NativeSelectOption
                key={option}
                value={option}>
                {option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="approvals-status">Status</FieldLabel>
          <NativeSelect
            defaultValue={status}
            id="approvals-status"
            name="status">
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {approvalStatusNames.map((option) => (
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
      <ApprovalsDataTable
        isRedacted={isRedacted}
        page={page}
        pendingCount={pendingCount}
        rows={tableRows}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default ApprovalsPage;
