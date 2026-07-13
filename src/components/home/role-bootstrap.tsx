"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/store";

const SESSION_KEY = "oga-mecho-first-open-done";

/**
 * On first app open per browser session, land on the screen
 * matching registration (motorist → home, pro → dashboard).
 * Mode is locked to account type (no free Client ↔ Pro switch).
 */
export function RoleBootstrap() {
  const { roleReady, registeredAs, accountType } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const didRun = useRef(false);

  useEffect(() => {
    if (!roleReady || didRun.current) return;
    didRun.current = true;

    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* continue once if storage blocked */
    }

    // Only redirect from root on first open
    if (pathname !== "/") return;

    if (accountType === "professional" || registeredAs !== "client") {
      router.replace("/dashboard");
    }
  }, [roleReady, registeredAs, accountType, pathname, router]);

  return null;
}
