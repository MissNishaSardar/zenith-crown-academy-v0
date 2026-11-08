import DashboardShell from "@/components/Layout/DashboardShell";
import { LayoutProps } from "@/lib/types";
import { requireSession } from "@/server/guards";

const DashboardRootLayout = async ({ children }: LayoutProps) => {
  const session = await requireSession();
  return (
    <DashboardShell
      storedRole={session.user.role}
      userEmail={session.user.email}
      userImage={session.user.image}
      userName={session.user.name}>
      {children}
    </DashboardShell>
  );
};

export default DashboardRootLayout;
