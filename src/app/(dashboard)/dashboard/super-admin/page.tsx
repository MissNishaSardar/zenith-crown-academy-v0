import type { Metadata } from "next";
import type { Route } from "next";

import {
  Ban,
  BookOpenCheck,
  CalendarCheck,
  GraduationCap,
  Hourglass,
  KeyRound,
  Landmark,
  ScrollText,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import StatCard from "@/components/SuperAdmin/StatCard";
import { roleTokenWhere } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Super admin",
};

const sectionTitleClass =
  "font-heading text-lg font-semibold tracking-tight text-foreground";

type RoleCount = {
  caption: string;
  icon: LucideIcon;
  label: string;
  value: number;
};

type EmptyCard = {
  caption: string;
  icon: LucideIcon;
  title: string;
};

const SuperAdminPage = async () => {
  await requireRole("super_admin");

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    bannedUsers,
    activeSessions,
    expiredSessions,
    auditActionsLast24h,
    students,
    teachers,
    parents,
  ] = await Promise.all([
    prisma.user.count({ where: { banned: true } }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.session.count({ where: { expiresAt: { lte: now } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: yesterday } } }),
    prisma.user.count({ where: roleTokenWhere("student") }),
    prisma.user.count({ where: roleTokenWhere("teacher") }),
    prisma.user.count({ where: roleTokenWhere("parent") }),
  ]);

  const roleCounts: RoleCount[] = [
    {
      caption: "Accounts with the student role",
      icon: GraduationCap,
      label: "Students",
      value: students,
    },
    {
      caption: "Accounts with the teacher role",
      icon: BookOpenCheck,
      label: "Teachers",
      value: teachers,
    },
    {
      caption: "Accounts with the parent role",
      icon: Users,
      label: "Parents",
      value: parents,
    },
  ];

  const emptyCards: EmptyCard[] = [
    {
      caption:
        "Appears here once the Accountant fees module records offline cash fees.",
      icon: Wallet,
      title: "Fees summary",
    },
    {
      caption:
        "Appears here once the Attendance module records daily attendance.",
      icon: CalendarCheck,
      title: "Attendance summary",
    },
  ];

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="flex w-full flex-col gap-8 sm:gap-10">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-heading text-foreground text-3xl font-bold tracking-tight">
            Overview
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
            Live counts straight from the database. Every linked card jumps to
            the module that owns its number.
          </p>
        </header>

        <section
          aria-labelledby="needs-decision"
          className="flex flex-col gap-3">
          <h2
            id="needs-decision"
            className={sectionTitleClass}>
            What needs my decision
          </h2>
          <div className="border-border rounded-2xl border border-dashed px-6 py-8 text-center sm:py-10">
            <Landmark
              className="text-muted-foreground mx-auto size-8"
              aria-hidden="true"
            />
            <p className="font-heading text-foreground mt-3 text-base font-semibold">
              Board decisions arrive with the Authority module
            </p>
            <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm leading-relaxed">
              Appointments, suspensions, policy ceilings and emergency orders
              will appear here once the Authority module is built. Nothing is
              decided from this screen until then.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="needs-attention"
          className="flex flex-col gap-3">
          <h2
            id="needs-attention"
            className={sectionTitleClass}>
            What needs my attention
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              href={
                "/dashboard/super-admin/users-and-roles?status=banned" as Route
              }
              hint="Review in Users and Roles"
              icon={Ban}
              label="Banned users"
              tone="destructive"
              value={bannedUsers}
            />
            <StatCard
              href={"/dashboard/super-admin/sessions" as Route}
              hint="Review in Sessions"
              icon={KeyRound}
              label="Active sessions"
              value={activeSessions}
            />
            <StatCard
              href={"/dashboard/super-admin/sessions?status=expired" as Route}
              hint="Review in Sessions"
              icon={Hourglass}
              label="Expired sessions"
              value={expiredSessions}
            />
            <StatCard
              hint="Arrives with the System Health module"
              icon={ScrollText}
              label="Audit actions in 24h"
              value={auditActionsLast24h}
            />
          </div>
        </section>

        <section
          aria-labelledby="school-doing"
          className="flex flex-col gap-3">
          <h2
            id="school-doing"
            className={sectionTitleClass}>
            How is the school doing
          </h2>
          <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-6 sm:gap-4">
            {roleCounts.map(({ caption, icon: Icon, label, value }) => (
              <div
                key={label}
                className="border-border bg-card text-card-foreground flex flex-col rounded-2xl border p-4 shadow-xs min-[560px]:col-span-2 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground text-[11px] leading-tight font-semibold tracking-[0.08em] uppercase">
                    {label}
                  </span>
                  <span className="border-border bg-secondary/60 text-muted-foreground shrink-0 rounded-lg border p-2">
                    <Icon
                      className="size-4"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <span className="font-heading mt-3 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                  {value.toLocaleString("en-IN")}
                </span>
                <span className="text-muted-foreground mt-1.5 text-[11px] font-medium sm:text-xs">
                  {caption}
                </span>
              </div>
            ))}
            {emptyCards.map(({ caption, icon: Icon, title }) => (
              <div
                key={title}
                className="border-border flex flex-col items-start rounded-2xl border border-dashed p-4 min-[560px]:col-span-3 sm:p-5">
                <span className="flex items-center gap-2">
                  <Icon
                    className="text-muted-foreground size-5"
                    aria-hidden="true"
                  />
                  <span className="font-heading text-foreground text-sm font-semibold">
                    {title}
                  </span>
                </span>
                <p className="text-muted-foreground mt-2 max-w-sm text-xs leading-relaxed sm:text-[13px]">
                  {caption}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};

export default SuperAdminPage;
