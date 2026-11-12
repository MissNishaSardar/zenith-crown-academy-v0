import {
  Ban,
  Eye,
  EyeOff,
  KeyRound,
  KeySquare,
  PenLine,
  ScrollText,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import type { AuditAction } from "@/server/audit";
import type { StatusTone } from "@/lib/statusTones";

/**
 * The eleven audit actions in display order, icon, friendly label and tone.
 * user.create is green, user.delete is red, session revokes are amber,
 * the remaining seven are neutral. Labels are written for school staff,
 * not for engineers; the raw code stays visible in the chip tooltip.
 */
export const AUDIT_ACTIONS = [
  "user.create",
  "user.update",
  "user.role_set",
  "user.password_set",
  "user.ban",
  "user.unban",
  "user.delete",
  "user.impersonate",
  "impersonate.stop",
  "session.revoke",
  "session.revoke_all",
] as const satisfies readonly AuditAction[];

export type AuditMeta = {
  icon: LucideIcon;
  label: string;
  tone: StatusTone;
};

const metaByAction: Record<AuditAction, AuditMeta> = {
  "user.create": { icon: UserPlus, label: "Created user", tone: "emerald" },
  "user.update": { icon: PenLine, label: "Updated profile", tone: "neutral" },
  "user.role_set": { icon: UserCog, label: "Changed roles", tone: "neutral" },
  "user.password_set": {
    icon: KeyRound,
    label: "Set password",
    tone: "neutral",
  },
  "user.ban": { icon: Ban, label: "Banned user", tone: "neutral" },
  "user.unban": { icon: UserCheck, label: "Unbanned user", tone: "neutral" },
  "user.delete": { icon: Trash2, label: "Deleted user", tone: "red" },
  "user.impersonate": {
    icon: Eye,
    label: "Started impersonating",
    tone: "neutral",
  },
  "impersonate.stop": {
    icon: EyeOff,
    label: "Stopped impersonating",
    tone: "neutral",
  },
  "session.revoke": {
    icon: KeyRound,
    label: "Signed out of one device",
    tone: "amber",
  },
  "session.revoke_all": {
    icon: KeySquare,
    label: "Signed out of all devices",
    tone: "amber",
  },
};

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === "string" &&
  (AUDIT_ACTIONS as readonly string[]).includes(value);

/** Defensive fallback for unknown stored strings: renders the raw value. */
export const auditMeta = (action: string): AuditMeta =>
  isAuditAction(action) ?
    metaByAction[action]
  : { icon: ScrollText, label: action, tone: "neutral" };
