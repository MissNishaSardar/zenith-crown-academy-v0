"use client";

import Link from "next/link";
import { useState } from "react";

import type { Route } from "next";
import { Badge } from "@/components/shadcnui/badge";
import {
  formatAuditValue,
  getAuditFieldLabel,
  getAuditSummary,
  getAuditTitle,
  getRelativeTime,
  groupAudits,
} from "@/lib/admin/auditPresentation";

export type AdministratorStats = {
  activeSessions: number;
  auditTotal: number;
  auditsThisWeek: number;
  bannedUsers: number;
  bansThisWeek: number;
  sessionsThisWeek: number;
  systemStatus: "degraded" | "ok";
  systemVersion: string;
  totalUsers: number;
  usersThisWeek: number;
};

export type AdministratorRecentAudit = {
  action: string;
  actorEmail: string | null;
  createdAt: string;
  createdAtDisplay: string;
  diffs: Array<{ after: unknown; before: unknown; field: string }>;
  entity: string;
  id: string;
};

type AdministratorOverviewProps = {
  recentAudits: AdministratorRecentAudit[];
  stats: AdministratorStats;
};

type StatCard = {
  alert: boolean;
  alertNote: string | null;
  href: Route;
  label: string;
  sub: string;
  trend: string;
  value: string;
};

const buildStatCards = (stats: AdministratorStats): StatCard[] => {
  const sessionsAlert = stats.activeSessions === 0;
  const bannedAlert = stats.bannedUsers > 0;
  return [
    {
      alert: false,
      alertNote: null,
      href: "/dashboard/administrator/users" as Route,
      label: "Total users",
      sub: "All accounts in the school",
      trend:
        stats.usersThisWeek > 0 ?
          `+${stats.usersThisWeek} this week`
        : "No new users this week",
      value: `${stats.totalUsers}`,
    },
    {
      alert: bannedAlert,
      alertNote: bannedAlert ? "Needs review" : null,
      href: "/dashboard/administrator/users?banned=banned" as Route,
      label: "Banned now",
      sub: "Blocked from signing in",
      trend:
        stats.bansThisWeek > 0 ?
          `+${stats.bansThisWeek} bans this week`
        : "No new bans this week",
      value: `${stats.bannedUsers}`,
    },
    {
      alert: sessionsAlert,
      alertNote: sessionsAlert ? "No active sessions" : null,
      href: "/dashboard/administrator/sessions" as Route,
      label: "Active sessions",
      sub: "Devices signed in now",
      trend:
        stats.sessionsThisWeek > 0 ?
          `+${stats.sessionsThisWeek} this week`
        : "No new sessions this week",
      value: `${stats.activeSessions}`,
    },
    {
      alert: false,
      alertNote: null,
      href: "/dashboard/administrator/audit" as Route,
      label: "Audit rows",
      sub: "Recorded admin actions",
      trend:
        stats.auditsThisWeek > 0 ?
          `+${stats.auditsThisWeek} this week`
        : "No activity this week",
      value: `${stats.auditTotal}`,
    },
  ];
};

const AdministratorOverview = ({
  recentAudits,
  stats,
}: AdministratorOverviewProps) => {
  const isOk = stats.systemStatus === "ok";
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const groups = groupAudits(recentAudits);

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) =>
      current.includes(key) ?
        current.filter((item) => item !== key)
      : [...current, key],
    );
  };

  const toggleRow = (id: string) => {
    setExpandedRows((current) =>
      current.includes(id) ?
        current.filter((item) => item !== id)
      : [...current, id],
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Link
        aria-label={
          isOk ?
            "Open system health, status all working"
          : "Open system health, status needs attention"
        }
        className="bg-card hover:border-primary/40 flex flex-col gap-2 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
        href={"/dashboard/administrator/system" as Route}>
        <div className="flex items-center gap-2">
          {isOk ?
            <Badge>All working</Badge>
          : <Badge variant="destructive">Needs attention</Badge>}
          <Badge variant="outline">Version {stats.systemVersion}</Badge>
        </div>
        <span className="text-primary text-sm font-medium underline-offset-4 hover:underline">
          Open system health
        </span>
      </Link>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {buildStatCards(stats).map((item) => (
          <Link
            aria-label={`${item.label}: ${item.value}. ${item.trend}`}
            className={
              item.alert ?
                "bg-card hover:border-destructive/50 border-destructive/40 flex flex-col gap-1 rounded-xl border p-4 transition-colors"
              : "bg-card hover:border-primary/40 flex flex-col gap-1 rounded-xl border p-4 transition-colors"
            }
            href={item.href}
            key={item.label}>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {item.label}
            </p>
            <p className="text-foreground text-2xl font-bold tracking-tight">
              {item.value}
            </p>
            <p className="text-muted-foreground text-xs">{item.sub}</p>
            <p className="text-muted-foreground text-xs font-medium">
              {item.trend}
            </p>
            {item.alertNote ?
              <p className="text-destructive text-xs font-semibold">
                {item.alertNote}
              </p>
            : null}
          </Link>
        ))}
      </div>

      <section
        aria-label="Recent admin activity"
        className="bg-card flex flex-col gap-2 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Recent admin activity</h2>
          <Link
            href={"/dashboard/administrator/audit" as Route}
            className="text-primary text-sm font-medium underline-offset-4 hover:underline">
            Open audit log
          </Link>
        </div>
        {groups.length > 0 ?
          <ul className="flex flex-col gap-1">
            {groups.map((group) => {
              const isSingle = group.items.length === 1;
              const groupOpen = expandedGroups.includes(group.key);
              if (isSingle) {
                const row = group.items[0];
                if (!row) {
                  return null;
                }
                const title = getAuditTitle(row.entity, row.action);
                const summary = getAuditSummary(row.diffs);
                const expanded = expandedRows.includes(row.id);
                return (
                  <li key={row.id}>
                    <button
                      aria-expanded={expanded}
                      className="hover:bg-muted/60 flex w-full flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-left text-xs"
                      onClick={() => toggleRow(row.id)}
                      type="button">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold">{title}</span>
                        <span className="text-muted-foreground truncate">
                          {row.actorEmail ?? "System"}
                        </span>
                        <time
                          className="text-muted-foreground ml-auto shrink-0"
                          dateTime={row.createdAt}
                          title={row.createdAtDisplay}>
                          {getRelativeTime(row.createdAt)}
                        </time>
                      </span>
                      <span className="text-muted-foreground truncate">
                        {summary}
                      </span>
                      {expanded ?
                        <span className="mt-1 flex flex-col gap-1">
                          {row.diffs.length > 0 ?
                            row.diffs.map((diff) => (
                              <span
                                className="rounded-md border px-2 py-1"
                                key={diff.field}>
                                <span className="font-semibold">
                                  {getAuditFieldLabel(diff.field)}
                                </span>
                                <span className="text-muted-foreground">
                                  {`: ${formatAuditValue(diff.before)} to ${formatAuditValue(diff.after)}`}
                                </span>
                              </span>
                            ))
                          : <span className="text-muted-foreground">
                              No field changes
                            </span>
                          }
                        </span>
                      : null}
                    </button>
                  </li>
                );
              }
              return (
                <li key={group.key}>
                  <button
                    aria-expanded={groupOpen}
                    className="hover:bg-muted/60 flex w-full flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-left text-xs"
                    onClick={() => toggleGroup(group.key)}
                    type="button">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-semibold">
                        {group.items.length} x {group.title}
                      </span>
                      <span className="text-muted-foreground truncate">
                        by {group.actorEmail ?? "System"}{" "}
                        {group.dayLabel.toLowerCase()}
                      </span>
                      <span className="text-muted-foreground ml-auto shrink-0">
                        {groupOpen ? "Hide" : "Show"}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Grouped to save space
                    </span>
                  </button>
                  {groupOpen ?
                    <ul className="mt-1 flex flex-col gap-1 pl-3">
                      {group.items.map((row) => {
                        const title = getAuditTitle(row.entity, row.action);
                        const summary = getAuditSummary(row.diffs);
                        const expanded = expandedRows.includes(row.id);
                        return (
                          <li key={row.id}>
                            <button
                              aria-expanded={expanded}
                              className="hover:bg-muted/60 flex w-full flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-left text-xs"
                              onClick={() => toggleRow(row.id)}
                              type="button">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-semibold">{title}</span>
                                <time
                                  className="text-muted-foreground ml-auto shrink-0"
                                  dateTime={row.createdAt}
                                  title={row.createdAtDisplay}>
                                  {getRelativeTime(row.createdAt)}
                                </time>
                              </span>
                              <span className="text-muted-foreground truncate">
                                {summary}
                              </span>
                              {expanded ?
                                <span className="mt-1 flex flex-col gap-1">
                                  {row.diffs.length > 0 ?
                                    row.diffs.map((diff) => (
                                      <span
                                        className="rounded-md border px-2 py-1"
                                        key={diff.field}>
                                        <span className="font-semibold">
                                          {getAuditFieldLabel(diff.field)}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {`: ${formatAuditValue(diff.before)} to ${formatAuditValue(diff.after)}`}
                                        </span>
                                      </span>
                                    ))
                                  : <span className="text-muted-foreground">
                                      No field changes
                                    </span>
                                  }
                                </span>
                              : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  : null}
                </li>
              );
            })}
          </ul>
        : <p className="text-muted-foreground text-sm">
            No audit rows yet. User actions will appear here.
          </p>
        }
      </section>
    </div>
  );
};

export default AdministratorOverview;
