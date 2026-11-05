import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
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
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole,
    }),
    nextCookies(),
  ],
  secret: serverEnv.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
