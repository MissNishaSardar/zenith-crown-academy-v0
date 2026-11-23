import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Parent",
};

const ParentPage = async () => {
  await requireRole("parent");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Parent workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.parent}
        title={`${roleLabels.parent} workspace`}
      />
    </div>
  );
};

export default ParentPage;
