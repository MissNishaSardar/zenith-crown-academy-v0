import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { Route } from "next";
import { resolveRolePath } from "@/lib/auth/permissions";
import { requireSession } from "@/server/guards";

export const metadata: Metadata = {
  title: "Dashboard",
};

const DashboardIndexPage = async () => {
  const session = await requireSession();
  // Unknown or missing roles fall back to the student home, which is the safe
  // non privileged area. Foreign role URLs still get bounced by the guards.
  redirect(resolveRolePath(session.user.role) as Route);
};

export default DashboardIndexPage;
