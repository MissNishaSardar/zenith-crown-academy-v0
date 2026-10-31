import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import prisma from "./dbClient/prisma";
import { serverEnv } from "./env/serverEnv";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
  secret: serverEnv.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
