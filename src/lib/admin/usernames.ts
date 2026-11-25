export const USERNAME_MIN_LENGTH = 3;

export const USERNAME_MAX_LENGTH = 30;

export const USERNAME_PATTERN = /^[A-Za-z0-9_.]+$/;

export const normalizeUsername = (value: string): string =>
  value.trim().toLowerCase();

export const isValidUsername = (value: string): boolean => {
  const trimmed = value.trim();
  return (
    trimmed.length >= USERNAME_MIN_LENGTH &&
    trimmed.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(trimmed)
  );
};

const cleanPart = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const cleanBase = (value: string): string => {
  const lowered = value.toLowerCase().replace(/[^a-z0-9_.]/g, "");
  const collapsed = lowered.replace(/[.]{2,}/g, ".").replace(/[_]{2,}/g, "_");
  const trimmed = collapsed.replace(/^[._]+/, "").replace(/[._]+$/, "");
  return trimmed.slice(0, USERNAME_MAX_LENGTH);
};

export const buildUsernameCandidates = (name: string): string[] => {
  const parts = name
    .trim()
    .toLowerCase()
    .split(/[\s._-]+/)
    .map((part) => cleanPart(part))
    .filter((part) => part.length > 0);
  const bases: string[] = [];
  if (parts.length === 0) {
    bases.push("user");
  } else if (parts.length === 1) {
    const only = parts[0] ?? "user";
    bases.push(only, `${only}.user`, `user.${only}`);
  } else {
    const first = parts[0] ?? "user";
    const last = parts[parts.length - 1] ?? "user";
    bases.push(
      `${first}.${last}`,
      `${first}${last}`,
      `${first}_${last}`,
      `${first[0]}.${last}`,
      `${first}${last[0]}`,
      first,
      last,
    );
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const cleaned = cleanBase(value);
    if (cleaned.length < USERNAME_MIN_LENGTH) {
      return;
    }
    if (!USERNAME_PATTERN.test(cleaned)) {
      return;
    }
    if (seen.has(cleaned)) {
      return;
    }
    seen.add(cleaned);
    out.push(cleaned);
  };
  for (const base of bases) {
    push(base);
    for (let n = 1; n <= 9; n += 1) {
      push(`${base}${n}`);
    }
  }
  return out;
};

type UsernameStore = {
  user: {
    findMany(args: {
      where: { username: { in: string[] } };
      select: { username: true };
    }): Promise<{ username: string | null }[]>;
  };
};

export const SUGGESTION_COUNT = 3;

export const suggestUsernames = async (
  name: string,
  db: UsernameStore,
): Promise<string[]> => {
  const candidates = buildUsernameCandidates(name);
  if (candidates.length === 0) {
    return [];
  }
  const taken = await db.user.findMany({
    where: { username: { in: candidates } },
    select: { username: true },
  });
  const takenSet = new Set(
    taken.map((row) => (row.username ?? "").toLowerCase()),
  );
  return candidates
    .filter((candidate) => !takenSet.has(candidate))
    .slice(0, SUGGESTION_COUNT);
};
