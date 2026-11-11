const AMBIGUOUS_FREE_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const AMBIGUOUS_FREE_LOWER = "abcdefghijkmnopqrstuvwxyz";
const AMBIGUOUS_FREE_DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*";

const ALL_CHARS =
  AMBIGUOUS_FREE_UPPER + AMBIGUOUS_FREE_LOWER + AMBIGUOUS_FREE_DIGITS + SYMBOLS;

const randomIndex = (max: number): number => {
  // Rejection sampling so every index is equally likely.
  const limit = Math.floor(256 / max) * max;
  const buffer = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const byte = buffer[0] ?? 0;
    if (byte < limit) {
      return byte % max;
    }
  }
};

const pickChar = (set: string): string => set.charAt(randomIndex(set.length));

// Generates a temporary password of the given length with at least one
// character from each class: upper, lower, digit, and symbol.
export const generateTempPassword = (length = 16): string => {
  const required = [
    pickChar(AMBIGUOUS_FREE_UPPER),
    pickChar(AMBIGUOUS_FREE_LOWER),
    pickChar(AMBIGUOUS_FREE_DIGITS),
    pickChar(SYMBOLS),
  ];
  const rest = Array.from(
    { length: Math.max(0, length - required.length) },
    () => pickChar(ALL_CHARS),
  );
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const current = chars[i] ?? "";
    chars[i] = chars[j] ?? "";
    chars[j] = current;
  }
  return chars.join("");
};
