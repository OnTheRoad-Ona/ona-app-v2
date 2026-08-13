"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/store";

const SESSION_KEY = "ona-first-open-done";

/**
 * First open per browser tab: land a Repair Pro on the pro dashboard instead
 * of the default customer home at "/".
 *
 * The decision waits for the AUTHORITATIVE role (`accountType`, applied from
 * the server profile) — never the stale `registeredAs` / ROLE_KEY from
 * localStorage. The effect re-runs when `accountType` resolves later (the
 * optimistic first paint can briefly carry a stale profile), so a pro is
 * still bounced to /dashboard once the server role arrives. Guests and
 * motorists stay on the customer home.
 */
export function RoleBootstrap() {
  const { roleReady, accountType } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!roleReady) return;
    // Pros only — customers + guests keep the customer home.
    if (accountType !== "professional") return;
    if (pathname !== "/") return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* storage blocked — still redirect */
    }
    router.replace("/dashboard");
  }, [roleReady, accountType, pathname, router]);

  return null;
}
