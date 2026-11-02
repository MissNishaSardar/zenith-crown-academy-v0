import { createEnv } from "@t3-oss/env-nextjs";
import z from "zod";

export const clientEnv = createEnv({
  client: {
    NEXT_PUBLIC_SITE_URL: z.url().optional(),
    // NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    // NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    //   process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
});
