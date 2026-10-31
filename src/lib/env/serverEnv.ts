import { createEnv } from "@t3-oss/env-nextjs";
import z from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z
      .string()
      .startsWith("file:./", {
        error: "DATABASE_URL must start with file:./",
      })
      .min(1, { error: "DATABASE_URL is required" }),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, {
      error: "BETTER_AUTH_SECRET must be at least 32 characters",
    }),
    NEXT_TELEMETRY_DISABLED: z.enum(["1", "0"]).optional(),
    CHECKPOINT_DISABLE: z.enum(["1", "0"]).optional(),
  },
  experimental__runtimeEnv: process.env,
});
