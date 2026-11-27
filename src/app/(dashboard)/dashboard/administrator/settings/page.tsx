import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import SchoolSettingsForm from "@/components/Admin/SchoolSettingsForm";
import { ensureSchoolSettings } from "@/lib/school-branding";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Settings",
};

const SettingsPage = async () => {
  await requirePermission("system:manage");
  const settings = await ensureSchoolSettings();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          {
            href: "/dashboard/administrator",
            label: "Overview",
          },
          { label: "Settings" },
        ]}
      />
      <PageHeader
        subtitle="School profile and branding"
        title="System settings"
      />
      <SchoolSettingsForm
        initialLogoPath={settings.logoPath}
        initialValues={{
          academicYear: settings.academicYear,
          address: settings.address,
          email: settings.email,
          motto: settings.motto,
          phone: settings.phone,
          schoolName: settings.schoolName,
        }}
      />
    </div>
  );
};

export default SettingsPage;
