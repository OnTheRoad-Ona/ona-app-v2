"use client";

import { BRAND_COPPER } from "@/components/auth/brand-hero-motion";

/**
 * /login is the post-splash entry host.
 * Auth gate shows BrandEntryScreen until Log In / Sign Up is tapped.
 * Fallback fill is brand copper (never blank white) if gate is mid-transition.
 * After Sign Up → /login/role · After Log In → /login/signin
 */
export default function LoginPage() {
  return (
    <div
      className="h-full w-full"
      style={{ backgroundColor: BRAND_COPPER }}
      aria-hidden
    />
  );
}
