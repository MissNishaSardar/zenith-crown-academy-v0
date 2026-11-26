const LOOPBACK_VALUES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const UNSPECIFIED_VALUES = new Set([
  "::",
  "0:0:0:0:0:0:0:0",
  "0000:0000:0000:0000:0000:0000:0000:0000",
]);

const isIPv4Octets = (value: string): boolean => {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }
    if (part.length > 1 && part.startsWith("0")) {
      return false;
    }
    const num = Number(part);
    return Number.isInteger(num) && num >= 0 && num <= 255;
  });
};

const normalizeGroup = (group: string): string | null => {
  if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
    return null;
  }
  const stripped = group.toLowerCase().replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
};

const expandGroups = (left: string[], right: string[]): string[] | null => {
  const normalizedLeft: string[] = [];
  for (const group of left) {
    const normalized = normalizeGroup(group);
    if (normalized === null) {
      return null;
    }
    normalizedLeft.push(normalized);
  }
  const normalizedRight: string[] = [];
  for (const group of right) {
    const normalized = normalizeGroup(group);
    if (normalized === null) {
      return null;
    }
    normalizedRight.push(normalized);
  }
  if (normalizedLeft.length + normalizedRight.length > 7) {
    return null;
  }
  const zeros = Array(8 - normalizedLeft.length - normalizedRight.length).fill(
    "0",
  );
  return [...normalizedLeft, ...zeros, ...normalizedRight];
};

const compressGroups = (groups: string[]): string => {
  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;
  for (let index = 0; index <= groups.length; index++) {
    const isZero = index < groups.length && groups[index] === "0";
    if (isZero) {
      if (currentStart < 0) {
        currentStart = index;
        currentLength = 1;
      } else {
        currentLength += 1;
      }
    } else {
      if (currentLength > bestLength) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
      currentStart = -1;
      currentLength = 0;
    }
  }
  if (bestLength < 2) {
    return groups.join(":");
  }
  const before = groups.slice(0, bestStart).join(":");
  const after = groups.slice(bestStart + bestLength).join(":");
  if (before === "") {
    return after === "" ? "::" : `::${after}`;
  }
  if (after === "") {
    return `${before}::`;
  }
  return `${before}::${after}`;
};

const compressIPv6 = (value: string): string | null => {
  const zoneSplit = value.split("%");
  const address = zoneSplit[0] ?? "";
  if (!address.includes(":")) {
    return null;
  }
  if (address.includes(".")) {
    return null;
  }
  const doubleColonParts = address.split("::");
  if (doubleColonParts.length > 2) {
    return null;
  }
  if (doubleColonParts.length === 2) {
    const leftRaw =
      doubleColonParts[0] === "" ? [] : doubleColonParts[0].split(":");
    const rightRaw =
      doubleColonParts[1] === "" ? [] : doubleColonParts[1].split(":");
    const expanded = expandGroups(leftRaw, rightRaw);
    if (!expanded) {
      return null;
    }
    return compressGroups(expanded);
  }
  const rawGroups = address.split(":");
  if (rawGroups.length !== 8) {
    return null;
  }
  const normalized: string[] = [];
  for (const group of rawGroups) {
    const next = normalizeGroup(group);
    if (next === null) {
      return null;
    }
    normalized.push(next);
  }
  return compressGroups(normalized);
};

export const formatIpAddress = (value: string | null | undefined): string => {
  if (value === null || value === undefined) {
    return "Unknown";
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") {
    return "Unknown";
  }
  if (UNSPECIFIED_VALUES.has(trimmed)) {
    return "Unknown";
  }
  if (LOOPBACK_VALUES.has(trimmed)) {
    return "localhost";
  }
  if (trimmed.startsWith("::ffff:")) {
    const ipv4Part = trimmed.slice("::ffff:".length);
    if (isIPv4Octets(ipv4Part)) {
      return ipv4Part === "127.0.0.1" ? "localhost" : ipv4Part;
    }
    return "Unknown";
  }
  if (isIPv4Octets(trimmed)) {
    return trimmed;
  }
  const compressed = compressIPv6(trimmed);
  if (compressed) {
    if (UNSPECIFIED_VALUES.has(compressed) || compressed === "::") {
      return "Unknown";
    }
    if (LOOPBACK_VALUES.has(compressed)) {
      return "localhost";
    }
    return compressed;
  }
  return "Unknown";
};
