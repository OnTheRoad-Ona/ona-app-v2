"use client";

import { AUTH_BG } from "@/components/auth/auth-plate";

/**
 * /login is the post-splash entry host.
 * Auth gate shows BrandEntryScreen until Log In / Sign Up is tapped.
 * After Sign Up → /login/role · After Log In → /login/signin
 */
export default function LoginPage() {
  return (
    <div
      className="h-full w-full"
      style={{ backgroundColor: AUTH_BG }}
      aria-hidden
    />
  );
}
