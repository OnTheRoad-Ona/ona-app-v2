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
  // Compress responses; skip source maps in prod for smaller deploys
  compress: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // Cache static assets aggressively on Vercel CDN
  async headers() {
    return [
      {
        source: "/media/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/brand/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
