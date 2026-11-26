import type { NextConfig } from "next";
import "./src/lib/env/clientEnv";
import "./src/lib/env/serverEnv";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typedRoutes: true,
  experimental: {
    agentUpgrade: "security",
    authInterrupts: true,
  },
};

export default nextConfig;
