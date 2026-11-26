"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { Route } from "next";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { roleLabels, roleNames } from "@/lib/auth/permissions";

import CreateUserDialog from "./CreateUserDialog";

type UsersToolbarProps = {
  initialBanned: string;
  initialRole: string;
  initialSearch: string;
};

const buildQuery = (values: {
  banned: string;
  role: string;
  search: string;
}): string => {
  const params = new URLSearchParams();
  if (values.search) {
    params.set("search", values.search);
  }
  if (values.role !== "all") {
    params.set("role", values.role);
  }
  if (values.banned !== "all") {
    params.set("banned", values.banned);
  }
  params.set("page", "1");
  return `?${params.toString()}`;
};

const UsersToolbar = ({
  initialBanned,
  initialRole,
  initialSearch,
}: UsersToolbarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Live URL search is the source of truth after mount. Sync it into local
  // state during render so the box never goes stale when the URL changes
  // elsewhere, such as the back button.
  // Typing does not touch the URL until the debounce below fires, so
  // in progress keystrokes are preserved. An effect based sync would trip
  // react-hooks/set-state-in-effect.
  const urlSearch = (searchParams.get("search") ?? initialSearch)
    .trim()
    .slice(0, 100);
  const [search, setSearch] = useState(initialSearch);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  const [createOpen, setCreateOpen] = useState(false);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  const rawRole = searchParams.get("role") ?? initialRole;
  const role = (roleNames as string[]).includes(rawRole) ? rawRole : "all";
  const rawBanned = searchParams.get("banned") ?? initialBanned;
  const banned =
    rawBanned === "banned" || rawBanned === "active" ? rawBanned : "all";

  useEffect(() => {
    if (search.trim() === urlSearch) {
      return;
    }
    const timer = setTimeout(() => {
      router.replace(
        `${pathname}${buildQuery({ banned, role, search: search.trim() })}` as Route,
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [search, role, banned, urlSearch, pathname, router]);

  const handleRoleChange = (value: string) => {
    router.replace(
      `${pathname}${buildQuery({ banned, role: value, search: search.trim() })}` as Route,
    );
  };

  const handleBannedChange = (value: string) => {
    router.replace(
      `${pathname}${buildQuery({ banned: value, role, search: search.trim() })}` as Route,
    );
  };

  const hasFilter = search.trim() !== "" || role !== "all" || banned !== "all";

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end sm:gap-4">
      <Field className="flex-1">
        <FieldLabel htmlFor="users-search">Search users</FieldLabel>
        <Input
          id="users-search"
          type="search"
          autoComplete="off"
          placeholder="Name, email or username"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <Field className="sm:w-auto">
        <FieldLabel htmlFor="users-role">Role</FieldLabel>
        <NativeSelect
          id="users-role"
          value={role}
          onChange={(event) => handleRoleChange(event.target.value)}
          className="w-full sm:w-44">
          <NativeSelectOption value="all">All roles</NativeSelectOption>
          {roleNames.map((roleName) => (
            <NativeSelectOption
              key={roleName}
              value={roleName}>
              {roleLabels[roleName]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field className="sm:w-auto">
        <FieldLabel htmlFor="users-banned">Status</FieldLabel>
        <NativeSelect
          id="users-banned"
          value={banned}
          onChange={(event) => handleBannedChange(event.target.value)}
          className="w-full sm:w-36">
          <NativeSelectOption value="all">All</NativeSelectOption>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="banned">Banned</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Button
        disabled={!hasFilter}
        onClick={() => {
          setSearch("");
          router.replace(`${pathname}?page=1` as Route);
        }}
        type="button"
        variant="outline">
        Clear
      </Button>
      <Button
        onClick={() => setCreateOpen(true)}
        type="button">
        <PlusIcon aria-hidden="true" />
        Create user
      </Button>
      <CreateUserDialog
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
    </div>
  );
};

export default UsersToolbar;
