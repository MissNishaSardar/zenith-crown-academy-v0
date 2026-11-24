"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { Route } from "next";
import { Button } from "@/components/shadcnui/button";
import { roleLabels, roleNames } from "@/lib/auth/permissions";

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
  // elsewhere, such as the footer Clear filters link or the back button.
  // Typing does not touch the URL until the debounce below fires, so
  // in progress keystrokes are preserved. An effect based sync would trip
  // react-hooks/set-state-in-effect.
  const urlSearch = (searchParams.get("search") ?? initialSearch)
    .trim()
    .slice(0, 100);
  const [search, setSearch] = useState(initialSearch);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
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
    }, 300);
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
      <div className="flex-1">
        <label
          className="mb-2 block text-[13.5px] font-semibold"
          htmlFor="users-search">
          Search users
        </label>
        <input
          aria-label="Search users"
          autoComplete="off"
          className="border-input bg-background/60 placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
          id="users-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, email or username"
          type="search"
          value={search}
        />
      </div>
      <div>
        <label
          className="mb-2 block text-[13.5px] font-semibold"
          htmlFor="users-role">
          Role
        </label>
        <select
          aria-label="Filter by role"
          className="border-input bg-background/60 focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px] sm:w-44"
          id="users-role"
          onChange={(event) => handleRoleChange(event.target.value)}
          value={role}>
          <option value="all">All roles</option>
          {roleNames.map((roleName) => (
            <option
              key={roleName}
              value={roleName}>
              {roleLabels[roleName]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          className="mb-2 block text-[13.5px] font-semibold"
          htmlFor="users-banned">
          Status
        </label>
        <select
          aria-label="Filter by status"
          className="border-input bg-background/60 focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px] sm:w-36"
          id="users-banned"
          onChange={(event) => handleBannedChange(event.target.value)}
          value={banned}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
      </div>
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
    </div>
  );
};

export default UsersToolbar;
