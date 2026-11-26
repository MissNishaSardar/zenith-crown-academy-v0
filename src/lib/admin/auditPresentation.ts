import { formatDateDisplay } from "@/lib/formatDate";

export type AuditDiffItem = {
  after: unknown;
  before: unknown;
  field: string;
};

const ENTITY_LABELS: Record<string, string> = {
  school_settings: "School settings",
  user: "User",
};

const ACTION_TITLES: Record<string, string> = {
  "school_settings:update": "Updated school settings",
  "school_settings:upload-logo": "Uploaded school logo",
  "user:ban": "Banned user",
  "user:create": "Created user",
  "user:impersonate": "Started impersonation",
  "user:revoke": "Revoked sessions",
  "user:set-password": "Reset user password",
  "user:set-role": "Changed user role",
  "user:stop-impersonating": "Stopped impersonation",
  "user:unban": "Unbanned user",
  "user:update": "Updated user",
};

const FIELD_LABELS: Record<string, string> = {
  academicYear: "Academic year",
  address: "Address",
  after: "After",
  banExpires: "Ban expires",
  banned: "Banned",
  banReason: "Ban reason",
  before: "Before",
  blocked: "Status",
  email: "Email",
  emailVerified: "Email verified",
  impersonatedUserId: "Impersonated user",
  logoPath: "Logo",
  motto: "Motto",
  name: "Name",
  phone: "Phone",
  reason: "Reason",
  role: "Role",
  schoolName: "School name",
  sessionId: "Session",
  userId: "User",
  username: "Username",
};

const humanizeKey = (value: string): string => {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (spaced.length === 0) {
    return value;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const getAuditEntityLabel = (entity: string): string =>
  ENTITY_LABELS[entity] ?? humanizeKey(entity);

export const getAuditTitle = (entity: string, action: string): string => {
  const direct = ACTION_TITLES[`${entity}:${action}`];
  if (direct) {
    return direct;
  }
  return `${humanizeKey(action)} ${getAuditEntityLabel(entity).toLowerCase()}`;
};

export const getAuditFieldLabel = (field: string): string =>
  FIELD_LABELS[field] ?? humanizeKey(field);

export const getAuditActionLabel = (action: string): string => {
  const userTitle = ACTION_TITLES[`user:${action}`];
  const settingsTitle = ACTION_TITLES[`school_settings:${action}`];
  if (userTitle && settingsTitle) {
    // Shared action name across entities. A single entity title would
    // mislead when the filter is All, so fall back to the generic label.
    if (userTitle !== settingsTitle) {
      return humanizeKey(action);
    }
    return userTitle;
  }
  if (userTitle) {
    return userTitle;
  }
  if (settingsTitle) {
    return settingsTitle;
  }
  return humanizeKey(action);
};

export const formatAuditValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "Not set";
  }
  if (typeof value === "string") {
    return value === "" ? "Empty" : value;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  try {
    const encoded = JSON.stringify(value);
    return encoded ?? String(value);
  } catch {
    return String(value);
  }
};

export const getAuditSummary = (diffs: AuditDiffItem[]): string => {
  if (diffs.length === 0) {
    return "No field changes";
  }
  const blocked = diffs.find((diff) => diff.field === "blocked");
  if (blocked && blocked.after === true) {
    const reason = diffs.find((diff) => diff.field === "reason");
    const reasonText =
      typeof reason?.after === "string" && reason.after.length > 0 ?
        `: ${reason.after}`
      : "";
    return `Blocked${reasonText}`;
  }
  if (diffs.length === 1) {
    const only = diffs[0];
    if (!only) {
      return "No field changes";
    }
    return `${getAuditFieldLabel(only.field)}: ${formatAuditValue(only.before)} to ${formatAuditValue(only.after)}`;
  }
  const labels = diffs.map((diff) => getAuditFieldLabel(diff.field));
  const shown = labels.slice(0, 3).join(", ");
  const extra = labels.length > 3 ? ` plus ${labels.length - 3} more` : "";
  return `${diffs.length} fields changed: ${shown}${extra}`;
};

export const getRelativeTime = (iso: string, nowMs?: number): string => {
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) {
    return iso;
  }
  const now = nowMs ?? Date.now();
  const seconds = Math.max(0, Math.floor((now - parsed) / 1000));
  if (seconds < 60) {
    return "Just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  return formatDateDisplay(parsed);
};

export const getDayLabel = (iso: string, nowMs?: number): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "Earlier";
  }
  const now = new Date(nowMs ?? Date.now());
  const startOfDay = (value: Date): Date =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(parsed).getTime()) / 86400000,
  );
  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  return formatDateDisplay(parsed);
};

export type GroupableAudit = {
  action: string;
  actorEmail: string | null;
  createdAt: string;
  entity: string;
  id: string;
};

export type AuditGroup<T extends GroupableAudit = GroupableAudit> = {
  actorEmail: string | null;
  dayLabel: string;
  items: T[];
  key: string;
  title: string;
};

export const groupAudits = <T extends GroupableAudit>(
  rows: T[],
): AuditGroup<T>[] => {
  const groups = new Map<string, AuditGroup<T>>();
  for (const row of rows) {
    const title = getAuditTitle(row.entity, row.action);
    const dayLabel = getDayLabel(row.createdAt);
    const key = `${row.actorEmail ?? "system"}|${title}|${dayLabel}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(row);
    } else {
      groups.set(key, {
        actorEmail: row.actorEmail,
        dayLabel,
        items: [row],
        key,
        title,
      });
    }
  }
  return [...groups.values()];
};
