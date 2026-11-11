import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import prisma from "./dbClient/prisma";
import { ac, defaultRole, roles } from "./auth/permissions";
import { serverEnv } from "./env/serverEnv";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Stub until a real mail service is added. The link is logged
      // in non-production only so the forgot flow can be verified end to end.
      void user;
      if (process.env.NODE_ENV !== "production") {
        console.info(`Password reset link (stub): ${url}`);
      }
    },
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole,
      bannedUserMessage: (user) => {
        const record = user as {
          banExpires?: unknown;
          banReason?: unknown;
        };
        const reason =
          typeof record.banReason === "string" && record.banReason.trim() ?
            record.banReason.trim()
          : null;
        const rawExpiry = record.banExpires;
        const expiresAt =
          rawExpiry instanceof Date ? rawExpiry
          : typeof rawExpiry === "string" ? new Date(rawExpiry)
          : null;
        const validExpiry =
          expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;
        const expiryNote =
          validExpiry ?
            ` until ${new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(validExpiry)}`
          : " permanently";
        const reasonNote = reason ? ` Reason: ${reason}.` : "";
        return `This account is banned${expiryNote}.${reasonNote} Contact the school office if you believe this is a mistake.`;
      },
    }),
    username({ displayUsername: false }),
    nextCookies(),
  ],
  secret: serverEnv.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
