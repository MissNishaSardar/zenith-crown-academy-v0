import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import SchoolSettingsDetails from "@/components/Admin/SchoolSettingsDetails";
import { getAcademicsLandingTrail } from "@/lib/dashboard-nav";
import { ensureSchoolSettings } from "@/lib/school-branding";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Academic details",
};

const AcademicsPage = async () => {
  await requirePermission("academic:view");
  const settings = await ensureSchoolSettings();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsLandingTrail()} />
      <PageHeader
        subtitle="School profile and current academic year"
        title="Academic details"
      />
      <SchoolSettingsDetails
        logoPath={settings.logoPath}
        values={{
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

export default AcademicsPage;
