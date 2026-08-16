"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/store";

const SESSION_KEY = "ona-first-open-done";

/**
 * Land a Repair Pro on the pro dashboard instead of the customer home.
 *
 * Waits for the AUTHORITATIVE role (`accountType`). Redirects:
 *  - first open of this tab as a Repair Pro
 *  - when the role switches Customer → Repair Pro while still on "/"
 *
 * A Repair Pro who later opens "/" on purpose (map) is not bounced again
 * unless they just switched into that role.
 */
export function RoleBootstrap() {
  const { roleReady, accountType } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const prevRole = useRef(accountType);

  useEffect(() => {
    if (!roleReady) return;

    const prev = prevRole.current;
    prevRole.current = accountType;

    if (accountType !== "professional") return;
    if (pathname !== "/") return;

    const justSwitchedToPro =
      prev !== "professional" && accountType === "professional";

    let firstOpen = false;
    try {
      if (sessionStorage.getItem(SESSION_KEY) !== "1") {
        sessionStorage.setItem(SESSION_KEY, "1");
        firstOpen = true;
      }
    } catch {
      firstOpen = true;
    }

    if (firstOpen || justSwitchedToPro) {
      router.replace("/dashboard");
    }
  }, [roleReady, accountType, pathname, router]);

  return null;
}
