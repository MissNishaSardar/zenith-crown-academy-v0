import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import AuditFilters from "@/components/Admin/AuditFilters";
import AuditList from "@/components/Admin/AuditList";
import prisma from "@/lib/dbClient/prisma";
import { formatDateTimeDisplay } from "@/lib/formatDate";
import {
  AUDIT_SETTINGS_ACTION_OPTIONS,
  AUDIT_USER_ACTION_OPTIONS,
  diffAuditFields,
} from "@/server/audit";
import { requirePermission } from "@/server/guards";

import type { Prisma } from "@generated/prisma/client";

export const metadata: Metadata = {
  title: "Audit log",
};

const PAGE_SIZE = 10;

const AUDIT_ALL_ACTION_OPTIONS = [
  ...new Set([...AUDIT_USER_ACTION_OPTIONS, ...AUDIT_SETTINGS_ACTION_OPTIONS]),
];

type AuditSearchParams = {
  action?: string | string[] | undefined;
  entity?: string | string[] | undefined;
  page?: string | string[] | undefined;
};

type AuditPageProps = {
  searchParams: Promise<AuditSearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const AuditPage = async ({ searchParams }: AuditPageProps) => {
  await requirePermission("system:manage");
  const raw = await searchParams;

  const entityParam = firstParam(raw.entity);
  const entity =
    entityParam === "all" || entityParam === "school_settings" ?
      entityParam
    : "user";
  const actionParam = firstParam(raw.action);
  const action =
    actionParam === "" || actionParam === "all" ? "all"
    : (AUDIT_ALL_ACTION_OPTIONS as readonly string[]).includes(actionParam) ?
      actionParam
    : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const where: Prisma.AuditLogWhereInput = {};
  if (entity !== "all") {
    where.entity = entity;
  }
  if (action !== "all") {
    where.action = action;
  }

  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const entries = await prisma.auditLog.findMany({
    where,
    select: {
      action: true,
      actorEmail: true,
      actorRole: true,
      after: true,
      before: true,
      createdAt: true,
      entity: true,
      entityId: true,
      id: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const rows = entries.map((entry) => ({
    // after and before stay in the select above for diff computation only.
    // The client receives diffs, not the full snapshots.
    action: entry.action,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    createdAt: entry.createdAt.toISOString(),
    createdAtDisplay: formatDateTimeDisplay(entry.createdAt),
    diffs: diffAuditFields(entry.before, entry.after),
    entity: entry.entity,
    entityId: entry.entityId,
    id: entry.id,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          {
            href: "/dashboard/administrator",
            label: "Overview",
          },
          { label: "Audit log" },
        ]}
      />
      <PageHeader
        subtitle="Administration trail"
        title="Audit log"
      />
      <AuditFilters
        actionOptions={AUDIT_ALL_ACTION_OPTIONS}
        initialAction={action}
        initialEntity={entity}
      />
      <AuditList
        action={action}
        base="/dashboard/administrator/audit"
        entity={entity}
        page={page}
        rows={rows}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default AuditPage;
