export type CredentialHandoutInput = {
  email: string;
  issuedAt: string;
  loginUrl: string;
  name: string;
  password: string;
  roleLabel: string;
  username: string;
};

export const buildCredentialFilename = (username: string): string => {
  const clean = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const base = clean.length > 0 ? clean : "account";
  return `credentials-${base}.txt`;
};

export const buildCredentialText = (input: CredentialHandoutInput): string => {
  const lines = [
    "Zenith Crown Academy - New account details",
    "",
    `Name: ${input.name}`,
    `Username: ${input.username}`,
    `Email: ${input.email}`,
    `Role: ${input.roleLabel}`,
    `Temporary password: ${input.password}`,
    "",
    `Sign in: ${input.loginUrl}`,
    `Issued: ${input.issuedAt}`,
    "",
    "Instructions:",
    "1. Sign in with the username and temporary password.",
    "2. Change the password after first sign in.",
    "3. Keep this slip private and destroy it after use.",
    "",
  ];
  return lines.join("\n");
};
