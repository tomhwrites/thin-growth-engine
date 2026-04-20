import { dirname } from "path";
import type { NextConfig } from "next";
import { fileURLToPath } from "url";

const rootDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
