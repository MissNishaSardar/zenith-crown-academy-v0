/**
 * Shared tone class strings tuned for both themes.
 * Used by health check badges and audit severity chips so the palette
 * renders identically everywhere.
 * Emerald: healthy or create. Amber: warning or revoke.
 * Red: failing or delete. Neutral: everything else.
 */
export const statusTones = {
  emerald:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
  amber:
    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
  red: "border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300",
  neutral: "border-border bg-secondary/60 text-muted-foreground",
} as const;

export type StatusTone = keyof typeof statusTones;
