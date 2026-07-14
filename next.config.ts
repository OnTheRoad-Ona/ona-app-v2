import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Separate dist for admin dev server (port 4500) vs public (3000)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Allow both localhost and 127.0.0.1 during local dev (fixes blank UI / blocked HMR)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Avoid picking up a parent-folder lockfile as workspace root
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
