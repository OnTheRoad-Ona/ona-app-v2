import type { AccountType } from "@/lib/types";

/**
 * Client (Motorist) vs Professional route access.
 * Pros stay on pro pages unless they registered as Customer.
 */

const PUBLIC_PREFIXES = ["/login", "/signup", "/logout", "/admin"];
// /login/reset-password and /signup/error are public

/** Paths motorists use for discovery / requests */
export function isClientAppPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/request")) return true;
  if (pathname.startsWith("/jobs")) return true;
  if (pathname.startsWith("/bookings")) return true;
  if (pathname.startsWith("/technician")) return true;
  if (pathname.startsWith("/search")) return true;
  return false;
}

/** Paths only professionals use for work */
export function isProAppPath(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/orders")) return true;
  if (pathname.startsWith("/jobs")) return true;
  if (pathname.startsWith("/artisan")) return true;
  return false;
}

/** Shared authenticated paths */
export function isSharedAppPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/messages")) return true;
  if (pathname.startsWith("/profile")) return true;
  if (pathname.startsWith("/settings")) return true;
  if (pathname.startsWith("/requests")) return true;
  if (pathname.startsWith("/jobs")) return true;
  if (pathname.startsWith("/verify")) return true;
  if (pathname.startsWith("/artisan")) return true;
  if (pathname.startsWith("/logout")) return true;
  if (pathname.startsWith("/wallet")) return true;
  // ONA Shop — customers + repair pros are buyers
  if (pathname.startsWith("/shop")) return true;
  return false;
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Where a signed-in user of this account type should live by default.
 */
export function homePathForAccount(accountType: AccountType | null): string {
  return accountType === "professional" ? "/dashboard" : "/";
}

/**
 * Whether this account type may visit the path.
 */
export function canAccessPath(
  accountType: AccountType | null,
  pathname: string
): boolean {
  if (!accountType) return true;
  if (isPublicPath(pathname)) return true;
  if (isSharedAppPath(pathname)) return true;

  if (accountType === "professional") {
    // Pros only on pro workspace (not client home / request flow)
    return isProAppPath(pathname) || isSharedAppPath(pathname);
  }

  // Motorist — not pro-only tools
  if (isProAppPath(pathname)) return false;
  return true;
}
