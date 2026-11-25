import DashboardShell from "@/components/Layout/DashboardShell";
import { LayoutProps } from "@/lib/types";
import { requireSession } from "@/server/guards";

const DashboardRootLayout = async ({ children }: LayoutProps) => {
  const session = await requireSession();
  const impersonatedBy =
    (
      session.session as unknown as {
        impersonatedBy?: string | null | undefined;
      }
    )?.impersonatedBy ?? null;
  return (
    <DashboardShell
      userEmail={session.user.email}
      userImage={session.user.image}
      userName={session.user.name}
      storedRole={session.user.role}
      initialImpersonatedBy={impersonatedBy}
      initialImpersonatedName={session.user.name}>
      {children}
    </DashboardShell>
  );
};

export default DashboardRootLayout;
