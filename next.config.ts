import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Windows without Developer Mode cannot create pnpm trace symlinks.
  // Docker builds on Linux still emit the production standalone bundle.
  output: process.platform === "win32" ? undefined : "standalone",
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
