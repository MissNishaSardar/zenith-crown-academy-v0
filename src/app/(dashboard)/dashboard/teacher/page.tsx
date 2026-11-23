import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Teacher",
};

const TeacherPage = async () => {
  await requireRole("teacher");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Teacher workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.teacher}
        title={`${roleLabels.teacher} workspace`}
      />
    </div>
  );
};

export default TeacherPage;
