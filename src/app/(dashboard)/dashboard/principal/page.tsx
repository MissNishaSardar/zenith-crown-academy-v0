import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Principal",
};

const PrincipalPage = async () => {
  await requireRole("principal");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Principal workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.principal}
        title={`${roleLabels.principal} workspace`}
      />
    </div>
  );
};

export default PrincipalPage;
