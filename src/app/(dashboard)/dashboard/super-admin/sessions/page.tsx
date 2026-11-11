import type { Metadata } from "next";

import SessionsTable from "@/components/SuperAdmin/SessionsTable";
import { requireRole } from "@/server/guards";
import type { AdminSessionStatus } from "@/server/sessions";

export const metadata: Metadata = {
  title: "Sessions",
};

const toStatusFilter = (value: unknown): AdminSessionStatus =>
  value === "active" || value === "expired" ? value : "all";

const SessionsPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const session = await requireRole("super_admin");
  const params = await searchParams;
  const initialStatus = toStatusFilter(params.status);
  const nowIso = new Date().toISOString();

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="flex w-full flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-heading text-foreground text-3xl font-bold tracking-tight">
            Sessions
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
            Every stored session, newest first. Revoke a single session, or
            every session for a user, when something looks wrong.
          </p>
        </header>
        <SessionsTable
          currentToken={session.session.token}
          initialStatus={initialStatus}
          nowIso={nowIso}
          selfId={session.user.id}
        />
      </div>
    </main>
  );
};

export default SessionsPage;
