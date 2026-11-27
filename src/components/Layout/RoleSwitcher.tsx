"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  parseRoleNames,
  roleLabels,
  roleUrlSlug,
} from "@/lib/auth/permissions";
import { switchActiveRole } from "@/server/admin/roleActions";

type RoleSwitcherProps = {
  activeRole?: string | null | undefined;
  storedRole: string | null | undefined;
};

const RoleSwitcher = ({ activeRole, storedRole }: RoleSwitcherProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const roles = parseRoleNames(storedRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const current =
    (activeRole && roles.includes(activeRole as (typeof roles)[number]) ?
      activeRole
    : roles.find((role) => pathname === `/dashboard/${roleUrlSlug(role)}`)) ??
    roles[0] ??
    "student";

  const onChange = async (value: string) => {
    const next = roles.find((role) => roleUrlSlug(role) === value);
    if (!next || pending) {
      return;
    }
    const hasChanged = next !== current;
    if (!hasChanged) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await withMinimumLoad(switchActiveRole({ role: next }));
    setPending(false);
    if (!result.ok) {
      setError(
        result.errors.role ?? result.errors.root ?? "Could not switch role.",
      );
      return;
    }
    router.push(`/dashboard/${value}` as Route);
    router.refresh();
  };

  return (
    <Field
      orientation="horizontal"
      className="w-full">
      <FieldLabel
        htmlFor="role-switcher"
        className="sr-only">
        Switch role
      </FieldLabel>
      <NativeSelect
        id="role-switcher"
        value={roleUrlSlug(current as (typeof roles)[number])}
        onChange={(event) => void onChange(event.target.value)}
        disabled={pending}
        className="w-full cursor-pointer">
        {roles.map((role) => (
          <NativeSelectOption
            key={role}
            value={roleUrlSlug(role)}>
            {roleLabels[role]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {pending ?
        <span
          role="status"
          className="text-muted-foreground text-xs">
          Switching
        </span>
      : null}
      {error ?
        <span
          role="alert"
          className="text-destructive text-xs">
          {error}
        </span>
      : null}
    </Field>
  );
};

export default RoleSwitcher;
