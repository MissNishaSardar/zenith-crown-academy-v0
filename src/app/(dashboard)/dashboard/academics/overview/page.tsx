import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ACADEMICS_BASE } from "@/lib/dashboard-nav";

export const metadata: Metadata = {
  title: "Academic details",
};

const AcademicsOverviewRedirect = () => redirect(ACADEMICS_BASE);

export default AcademicsOverviewRedirect;
