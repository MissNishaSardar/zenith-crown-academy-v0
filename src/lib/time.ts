export const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});

export const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const relativeTimeFmt = new Intl.RelativeTimeFormat("en-IN", {
  numeric: "auto",
});

export const relativeTime = (iso: string, nowMs: number): string => {
  const diffMs = new Date(iso).getTime() - nowMs;
  const sign = diffMs < 0 ? -1 : 1;
  const abs = Math.abs(diffMs);
  if (abs < 60_000) {
    return diffMs < 0 ? "under a minute ago" : "in under a minute";
  }
  if (abs < 3_600_000) {
    return relativeTimeFmt.format(sign * Math.floor(abs / 60_000), "minute");
  }
  if (abs < 86_400_000) {
    return relativeTimeFmt.format(sign * Math.floor(abs / 3_600_000), "hour");
  }
  if (abs < 30 * 86_400_000) {
    return relativeTimeFmt.format(sign * Math.floor(abs / 86_400_000), "day");
  }
  if (abs < 365 * 86_400_000) {
    return relativeTimeFmt.format(
      sign * Math.floor(abs / (30 * 86_400_000)),
      "month",
    );
  }
  return relativeTimeFmt.format(
    sign * Math.floor(abs / (365 * 86_400_000)),
    "year",
  );
};
