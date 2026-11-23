import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Office staff",
};

const OfficeStaffPage = async () => {
  await requireRole("office_staff");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Office staff workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.office_staff}
        title={`${roleLabels.office_staff} workspace`}
      />
    </div>
  );
};

export default OfficeStaffPage;
