import {
  ArrowRightIcon,
  ScrollTextIcon,
  TriangleAlertIcon,
} from "lucide-react";

import AuditChip from "@/components/SuperAdmin/AuditChip";
import RelativeTime from "@/components/SuperAdmin/RelativeTime";

export type AuditActivityRow = {
  action: string;
  actorEmail: string;
  actorName: string;
  createdAt: Date;
  id: string;
  targetEmail: string | null;
  targetName: string | null;
};

type AuditActivityListProps = {
  available: boolean;
  nowIso: string;
  rows: AuditActivityRow[];
};

const AuditActivityList = ({
  available,
  nowIso,
  rows,
}: AuditActivityListProps) => {
  if (!available) {
    return (
      <div className="border-border rounded-2xl border border-dashed px-6 py-8 text-center sm:py-10">
        <TriangleAlertIcon
          aria-hidden="true"
          className="text-muted-foreground mx-auto size-8"
        />
        <p className="font-heading text-foreground mt-3 text-base font-semibold">
          Admin activity unavailable
        </p>
        <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm leading-relaxed">
          The database is unreachable right now. Recheck once it is back to see
          the audit trail.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border-border rounded-2xl border border-dashed px-6 py-8 text-center sm:py-10">
        <ScrollTextIcon
          aria-hidden="true"
          className="text-muted-foreground mx-auto size-8"
        />
        <p className="font-heading text-foreground mt-3 text-base font-semibold">
          No admin activity yet
        </p>
        <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm leading-relaxed">
          Admin actions taken by super admins will be recorded here.
        </p>
      </div>
    );
  }

  const nowMs = new Date(nowIso).getTime();

  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-xs">
      <ul className="divide-border divide-y">
        {rows.map((row) => {
          const iso = row.createdAt.toISOString();
          const target = row.targetName ?? row.targetEmail ?? "No target";
          return (
            <li
              key={row.id}
              className="grid grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-5">
              <AuditChip action={row.action} />
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {row.actorName}
                </span>
                <span className="text-muted-foreground hidden truncate text-xs md:inline">
                  {row.actorEmail}
                </span>
                <ArrowRightIcon
                  aria-hidden="true"
                  className="text-muted-foreground size-3.5 shrink-0"
                />
                <span className="truncate text-sm">{target}</span>
              </div>
              <RelativeTime
                iso={iso}
                nowMs={nowMs}
                className="shrink-0"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default AuditActivityList;
