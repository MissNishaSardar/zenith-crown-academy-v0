import type { Metadata } from "next";

import UsersTable from "@/components/SuperAdmin/UsersTable";
import { roleNames, type RoleName } from "@/lib/auth/permissions";
import { requireRole } from "@/server/guards";
import type { AdminUserRoleFilter, AdminUserStatus } from "@/server/users";

export const metadata: Metadata = {
  title: "Users and Roles",
};

const toRoleFilter = (value: unknown): AdminUserRoleFilter => {
  if (typeof value !== "string") {
    return "all";
  }
  return (roleNames as readonly string[]).includes(value) ?
      (value as RoleName)
    : "all";
};

const toStatusFilter = (value: unknown): AdminUserStatus =>
  value === "active" || value === "banned" ? value : "all";

const UsersAndRolesPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const session = await requireRole("super_admin");
  const params = await searchParams;

  const initialRole = toRoleFilter(params.role);
  const initialStatus = toStatusFilter(params.status);

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="flex w-full flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-heading text-foreground text-3xl font-bold tracking-tight">
            Users and Roles
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
            Create accounts, assign roles, and manage access for every person at
            the school. Changes apply immediately.
          </p>
        </header>
        <UsersTable
          initialRole={initialRole}
          initialStatus={initialStatus}
          selfId={session.user.id}
        />
      </div>
    </main>
  );
};

export default UsersAndRolesPage;
