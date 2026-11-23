import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { roleDescriptions, roleLabels } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Librarian",
};

const LibrarianPage = async () => {
  await requireRole("librarian");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Librarian workspace" },
        ]}
      />
      <PageHeader
        subtitle={roleDescriptions.librarian}
        title={`${roleLabels.librarian} workspace`}
      />
    </div>
  );
};

export default LibrarianPage;
