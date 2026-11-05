import { LayoutProps } from "@/lib/types";
import { requireSession } from "@/server/guards";

const DashboardRootLayout = async ({ children }: LayoutProps) => {
  await requireSession();
  return <div className="flex min-h-svh flex-col">{children}</div>;
};

export default DashboardRootLayout;
