import type { Metadata } from "next";

import AdministratorOverview from "@/components/Admin/AdministratorOverview";
import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import prisma from "@/lib/dbClient/prisma";
import { roleDescriptions } from "@/lib/auth/permissions";
import { formatDateTimeDisplay } from "@/lib/formatDate";
import { diffAuditFields } from "@/server/audit";
import { requirePermission } from "@/server/guards";
import { getHealthSnapshot } from "@/server/system/health";

export const metadata: Metadata = {
  title: "Administrator",
};

const AdministratorPage = async () => {
  await requirePermission("system:manage");

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    bannedUsers,
    activeSessions,
    auditTotal,
    usersThisWeek,
    auditsThisWeek,
    sessionsThisWeek,
    bansThisWeek,
    snapshot,
    recent,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        OR: [{ banExpires: null }, { banExpires: { gt: now } }],
        banned: true,
      },
    }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.auditLog.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.session.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.auditLog.count({
      where: { action: "ban", createdAt: { gte: weekAgo } },
    }),
    getHealthSnapshot(),
    prisma.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        action: true,
        actorEmail: true,
        after: true,
        before: true,
        createdAt: true,
        entity: true,
        id: true,
      },
      take: 5,
    }),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Overview" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.administrator}
        title="Overview"
      />
      <AdministratorOverview
        recentAudits={recent.map((entry) => ({
          action: entry.action,
          actorEmail: entry.actorEmail,
          createdAt: entry.createdAt.toISOString(),
          createdAtDisplay: formatDateTimeDisplay(entry.createdAt),
          diffs: diffAuditFields(entry.before, entry.after),
          entity: entry.entity,
          id: entry.id,
        }))}
        stats={{
          activeSessions,
          auditTotal,
          auditsThisWeek,
          bannedUsers,
          bansThisWeek,
          sessionsThisWeek,
          systemStatus: snapshot.status,
          systemVersion: snapshot.version,
          totalUsers,
          usersThisWeek,
        }}
      />
    </div>
  );
};

export default AdministratorPage;
