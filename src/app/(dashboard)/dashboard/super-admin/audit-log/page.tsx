import type { Metadata } from "next";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import AuditLogTable, {
  type AuditLogInitialFilters,
} from "@/components/SuperAdmin/AuditLogTable";
import { isAuditAction } from "@/lib/auditSeverity";
import type { AuditLogActionFilter } from "@/server/auditLog";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Audit log",
};

const toActionFilter = (value: unknown): AuditLogActionFilter =>
  isAuditAction(value) ? value : "all";

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const toDateInputValue = (value: unknown): string => {
  const raw = firstParam(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "";
  }
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "" : raw;
};

const AuditLogPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  await requireRole("super_admin");
  const params = await searchParams;

  const initialFilters: AuditLogInitialFilters = {
    action: toActionFilter(firstParam(params.action)),
    actor: firstParam(params.actor).trim().slice(0, 200),
    from: toDateInputValue(params.from),
    to: toDateInputValue(params.to),
  };
  const nowIso = new Date().toISOString();

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="flex w-full flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <Link
            href="/dashboard/super-admin/system-health"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-xs font-semibold underline-offset-4 transition-colors hover:underline">
            <ArrowLeft
              aria-hidden="true"
              className="size-3.5"
            />
            Back to System Health
          </Link>
          <h1 className="font-heading text-foreground text-3xl font-bold tracking-tight">
            Audit log
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
            Every admin action taken by super admins, newest first. Filter by
            action, actor or date range.
          </p>
        </header>
        <AuditLogTable
          initialFilters={initialFilters}
          nowIso={nowIso}
        />
      </div>
    </main>
  );
};

export default AuditLogPage;
