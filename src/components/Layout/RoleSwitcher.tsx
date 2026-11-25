"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";

import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
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
        value={roleUrlSlug(activeRole)}
        onChange={(event) => onChange(event.target.value)}
        className="w-full cursor-pointer">
        {roles.map((role) => (
          <NativeSelectOption
            key={role}
            value={roleUrlSlug(role)}>
            {roleLabels[role]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
};

export default RoleSwitcher;
