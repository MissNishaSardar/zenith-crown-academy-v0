import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Vice principal",
};

const VicePrincipalPage = async () => {
  await requireRole("vice_principal");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Vice principal workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.vice_principal}
        title={`${roleLabels.vice_principal} workspace`}
      />
    </div>
  );
};

export default VicePrincipalPage;
