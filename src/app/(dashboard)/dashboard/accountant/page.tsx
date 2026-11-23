import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Accountant",
};

const AccountantPage = async () => {
  await requireRole("accountant");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Accountant workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.accountant}
        title={`${roleLabels.accountant} workspace`}
      />
    </div>
  );
};

export default AccountantPage;
