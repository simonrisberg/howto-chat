import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native packages must run as plain Node modules, not be bundled.
  serverExternalPackages: ["@lancedb/lancedb"],
};

export default nextConfig;
