"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { PhoneShell } from "@/components/layout/phone-shell";

/** Phone shell + auth for the consumer app; full-page for /admin backend. */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <PhoneShell>
      <AuthGate>{children}</AuthGate>
    </PhoneShell>
  );
}
