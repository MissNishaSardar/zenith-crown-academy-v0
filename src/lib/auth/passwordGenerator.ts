const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

export const GENERATED_PASSWORD_LENGTH = 12;

const randomIndex = (exclusiveMax: number): number => {
  const range = 0xffffffff;
  const limit = range - (range % exclusiveMax);
  const sample = new Uint32Array(1);
  do {
    crypto.getRandomValues(sample);
  } while ((sample[0] ?? range) >= limit);
  return (sample[0] ?? 0) % exclusiveMax;
};

const pick = (chars: string): string => chars[randomIndex(chars.length)] ?? "";

export const generatePassword = (
  length: number = GENERATED_PASSWORD_LENGTH,
): string => {
  if (length < 4) {
    throw new Error("generatePassword needs length 4 or more");
  }
  const out = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  for (let i = 4; i < length; i += 1) {
    out.push(pick(ALL));
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const current = out[i] ?? "";
    out[i] = out[j] ?? "";
    out[j] = current;
  }
  return out.join("");
};
