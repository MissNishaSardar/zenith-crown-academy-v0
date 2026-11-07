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
    }),
    username({ displayUsername: false }),
    nextCookies(),
  ],
  secret: serverEnv.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
