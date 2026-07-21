import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * On backend hostnames, send non-admin traffic to the control centre.
 * Prevents the consumer phone shell from loading at backend root.
 */
function isBackendHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0];
  if (h === "localhost" || h === "127.0.0.1") {
    // Local admin dev uses port 4500 only
    const port = host.includes(":") ? host.split(":")[1] : "";
    return port === "4500";
  }
  return (
    h.includes("ogamecho-backend") ||
    h.startsWith("ogamecho-backend") ||
    h.includes("ona-backend") ||
    h.startsWith("ona-backend") ||
    h === "ogamecho-backend-mi.vercel.app" ||
    h === "ogamecho-backend-two.vercel.app" ||
    h === "ogamecho-backend-wit7.vercel.app" ||
    h === "ona-backend.vercel.app" ||
    h === "ona-backend-mi.vercel.app"
  );
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (!isBackendHost(host)) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/admin";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Skip static assets; run on pages and API only as needed.
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/|media/|.*\\..*).*)",
  ],
};
