import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import SystemHealthView from "@/components/Admin/SystemHealthView";
import { getHealthSnapshot } from "@/server/system/health";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "System health",
};

const SystemPage = async () => {
  await requirePermission("system:view");
  const snapshot = await getHealthSnapshot();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          {
            href: "/dashboard/administrator",
            label: "Administrator workspace",
          },
          { label: "System health" },
        ]}
      />
      <PageHeader
        subtitle="Simple status for learning data, files and setup"
        title="System health"
      />
      <SystemHealthView snapshot={snapshot} />
    </div>
  );
};

export default SystemPage;
