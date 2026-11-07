"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";

import {
  parseRoleNames,
  roleLabels,
  roleUrlSlug,
} from "@/lib/auth/permissions";

type RoleSwitcherProps = {
  storedRole: string | null | undefined;
};

const RoleSwitcher = ({ storedRole }: RoleSwitcherProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const roles = parseRoleNames(storedRole);

  if (roles.length === 0) {
    return null;
  }

  if (roles.length === 1) {
    const only = roles[0] ?? "student";
    return (
      <span className="bg-secondary text-secondary-foreground w-fit rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
        {roleLabels[only]}
      </span>
    );
  }

  const activeRole =
    roles.find((role) => pathname === `/dashboard/${roleUrlSlug(role)}`) ??
    roles[0] ??
    "student";

  const onChange = (value: string) => {
    router.push(`/dashboard/${value}` as Route);
  };

  return (
    <label
      htmlFor="role-switcher"
      className="flex w-full items-center gap-2">
      <span className="sr-only">Switch role</span>
      <select
        id="role-switcher"
        aria-label="Switch role"
        value={roleUrlSlug(activeRole)}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full cursor-pointer rounded-md border px-2.5 text-sm font-medium outline-none focus-visible:ring-[3px]">
        {roles.map((role) => (
          <option
            key={role}
            value={roleUrlSlug(role)}>
            {roleLabels[role]}
          </option>
        ))}
      </select>
    </label>
  );
};

export default RoleSwitcher;
