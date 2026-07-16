"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { InAppCallProvider } from "@/components/call/in-app-call";
import { InboundBanner } from "@/components/layout/inbound-banner";
import { PhoneShell } from "@/components/layout/phone-shell";
import { clearPageExitClass, recordNavigation } from "@/lib/navigation";

/** Phone shell + auth for the consumer app; full-page for /admin backend. */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const isAdmin = pathname.startsWith("/admin");

  // Track path so Back returns to the immediate previous page
  useEffect(() => {
    if (isAdmin) return;
    clearPageExitClass();
    const qs =
      typeof window !== "undefined" ? window.location.search || "" : "";
    recordNavigation(`${pathname}${qs}`);
  }, [pathname, isAdmin]);

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <PhoneShell>
      <InAppCallProvider>
        <AuthGate>
          <InboundBanner />
          {children}
        </AuthGate>
      </InAppCallProvider>
    </PhoneShell>
  );
}
