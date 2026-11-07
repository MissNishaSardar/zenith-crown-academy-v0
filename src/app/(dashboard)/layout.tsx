import DashboardHeader from "@/components/Layout/DashboardHeader";
import { LayoutProps } from "@/lib/types";
import { requireSession } from "@/server/guards";

const DashboardRootLayout = async ({ children }: LayoutProps) => {
  const session = await requireSession();
  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader
        userEmail={session.user.email}
        userImage={session.user.image}
        userName={session.user.name}
        storedRole={session.user.role}
      />
      {children}
    </div>
  );
};

export default DashboardRootLayout;
