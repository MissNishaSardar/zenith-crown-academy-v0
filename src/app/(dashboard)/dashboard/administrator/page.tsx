import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Administrator",
};

const AdministratorPage = async () => {
  await requireRole("administrator");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Administrator workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.administrator}
        title={`${roleLabels.administrator} workspace`}
      />
    </div>
  );
};

export default AdministratorPage;
