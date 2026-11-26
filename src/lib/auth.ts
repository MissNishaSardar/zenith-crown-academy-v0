import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import prisma from "./dbClient/prisma";
import { ac, defaultRole, roles } from "./auth/permissions";
import { serverEnv } from "./env/serverEnv";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  advanced: {
    ipAddress: {
      // Prefer the proxy header when present, fall back to the standard
      // header for direct connections. Order matters: a client can spoof
      // later entries, so the proxy-controlled header stays first.
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
    },
  },
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
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
    }),
    username({ displayUsername: false }),
    nextCookies(),
  ],
  secret: serverEnv.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
