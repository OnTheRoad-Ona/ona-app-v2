import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Optional external API proxy. Disabled by default.
 * When API_PROXY_TARGET was always on for ona-mi production, job GET
 * /api/jobs/[id] hit a stale backend and returned "Not authenticated"
 * while local POST /api/jobs worked — frontend deploys never fixed load.
 * Opt-in only: set USE_API_PROXY=true AND API_PROXY_TARGET.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET;
const useApiProxy =
  process.env.USE_API_PROXY === "true" && Boolean(apiProxyTarget);
const nextConfig: NextConfig = {
  async rewrites() {
    if (useApiProxy && apiProxyTarget) {
      return [
        { source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` },
      ];
    }
    return [];
  },
  async redirects() {
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
  // Smaller client bundles — tree-shake heavy icon/UI packages (no UI change)
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-avatar", "@radix-ui/react-dialog"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  // Cache static assets aggressively on Vercel CDN
  async headers() {
    return [
      // App shell / HTML must revalidate so phones pick up new JS after deploys
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
      {
        source: "/((?!_next/static|_next/image|media|brand|technicians|favicon.ico|api).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
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
      {
        source: "/technicians/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // Immutable hashed Next assets — max CDN hit, less mobile re-download.
      // In development, never cache: chunk names are stable across rebuilds, so
      // an immutable header makes browsers keep serving stale code after edits.
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value:
              process.env.NODE_ENV === "development"
                ? "no-store, no-cache, must-revalidate, max-age=0"
                : "public, max-age=31536000, immutable",
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
