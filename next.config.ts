import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const apiProxyTarget = process.env.API_PROXY_TARGET;
const isBackend = process.env.IS_BACKEND === "true";

const nextConfig: NextConfig = {
  async rewrites() {
    if (apiProxyTarget) {
      return [
        { source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` },
      ];
    }
    return [];
  },
  async redirects() {
    if (isBackend) {
      return [
        {
          source: "/:path((?!api).*)",
          destination: "https://ona-mi.vercel.app/:path",
          permanent: false,
        },
      ];
    }
    return [];
  },
  // Separate dist for admin dev server (port 4500) vs public (3000)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Allow both localhost and 127.0.0.1 during local dev (fixes blank UI / blocked HMR)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Avoid picking up a parent-folder lockfile as workspace root
  turbopack: {
    root: projectRoot,
  },
  // Ensure native/pg deps resolve on Vercel serverless for Local BackUp
  serverExternalPackages: ["pg", "dotenv"],
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
      // Payment pages: allow Payment Request API; never frame our app in strangers
      {
        source: "/payments/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "payment=(self), publickey-credentials-get=(self)",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          // Do not set restrictive CSP that blocks form posts to Flutterwave
        ],
      },
    ];
  },
};

export default nextConfig;
