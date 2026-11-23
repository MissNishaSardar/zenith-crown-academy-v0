import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Owner",
};

const OwnerPage = async () => {
  await requireRole("owner");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Owner workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.owner}
        title={`${roleLabels.owner} workspace`}
      />
    </div>
  );
};

export default OwnerPage;
