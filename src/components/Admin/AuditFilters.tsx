"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Route } from "next";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import {
  getAuditActionLabel,
  getAuditTitle,
} from "@/lib/admin/auditPresentation";

type AuditFiltersProps = {
  actionOptions: readonly string[];
  initialAction: string;
  initialEntity: string;
};

const SETTINGS_ONLY_ACTIONS = new Set(["upload-logo"]);

const USER_ONLY_ACTIONS = new Set([
  "ban",
  "create",
  "impersonate",
  "revoke",
  "set-password",
  "set-role",
  "stop-impersonating",
  "unban",
]);

const getVisibleOptions = (
  options: readonly string[],
  entity: string,
): readonly string[] => {
  if (entity === "school_settings") {
    return options.filter((option) => !USER_ONLY_ACTIONS.has(option));
  }
  if (entity === "user") {
    return options.filter((option) => !SETTINGS_ONLY_ACTIONS.has(option));
  }
  return options;
};

const getActionLabel = (option: string, entity: string): string => {
  if (entity === "user" || entity === "school_settings") {
    return getAuditTitle(entity, option);
  }
  return getAuditActionLabel(option);
};

const buildQuery = (values: { action: string; entity: string }): string => {
  const params = new URLSearchParams();
  if (values.entity !== "user") {
    params.set("entity", values.entity);
  }
  if (values.action !== "all") {
    params.set("action", values.action);
  }
  params.set("page", "1");
  return `?${params.toString()}`;
};

const AuditFilters = ({
  actionOptions,
  initialAction,
  initialEntity,
}: AuditFiltersProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawEntity = searchParams.get("entity") ?? initialEntity;
  const entity =
    (
      rawEntity === "all" ||
      rawEntity === "user" ||
      rawEntity === "school_settings"
    ) ?
      rawEntity
    : "user";
  const rawAction = searchParams.get("action") ?? initialAction;
  const action =
    rawAction === "all" || actionOptions.includes(rawAction) ?
      rawAction
    : "all";

  const handleEntityChange = (value: string) => {
    router.replace(
      `${pathname}${buildQuery({ action, entity: value })}` as Route,
    );
  };

  const handleActionChange = (value: string) => {
    router.replace(
      `${pathname}${buildQuery({ action: value, entity })}` as Route,
    );
  };

  const hasFilter = entity !== "user" || action !== "all";

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end sm:gap-4">
      <Field className="sm:w-auto">
        <FieldLabel htmlFor="audit-entity">Entity</FieldLabel>
        <NativeSelect
          id="audit-entity"
          value={entity}
          onChange={(event) => handleEntityChange(event.target.value)}
          className="w-full sm:w-44">
          <NativeSelectOption value="user">User</NativeSelectOption>
          <NativeSelectOption value="school_settings">
            School settings
          </NativeSelectOption>
          <NativeSelectOption value="all">All</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field className="sm:w-auto">
        <FieldLabel htmlFor="audit-action">Action</FieldLabel>
        <NativeSelect
          id="audit-action"
          value={action}
          onChange={(event) => handleActionChange(event.target.value)}
          className="w-full sm:w-44">
          <NativeSelectOption value="all">All actions</NativeSelectOption>
          {getVisibleOptions(actionOptions, entity).map((option) => (
            <NativeSelectOption
              key={option}
              value={option}>
              {getActionLabel(option, entity)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button
        disabled={!hasFilter}
        onClick={() => {
          router.replace(`${pathname}?page=1` as Route);
        }}
        type="button"
        variant="outline">
        Clear
      </Button>
    </div>
  );
};

export default AuditFilters;
