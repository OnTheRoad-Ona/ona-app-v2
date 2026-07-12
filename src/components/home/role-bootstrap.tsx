"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/store";

const SESSION_KEY = "oga-mecho-first-open-done";

/**
 * On first app open per browser session, land on the screen
 * matching registration (client → home, pro → dashboard).
 * User can still switch Client ↔ Professional in the menu.
 */
export function RoleBootstrap() {
  const { roleReady, registeredAs } = useApp();
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

    if (registeredAs !== "client") {
      router.replace("/dashboard");
    }
  }, [roleReady, registeredAs, pathname, router]);

  return null;
}
