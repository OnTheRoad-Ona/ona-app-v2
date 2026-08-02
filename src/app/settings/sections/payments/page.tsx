"use client";

/**
 * Legacy intermediate hop — redirect to the unified payments hub.
 * Customers land here from old links; Pros use ☰ → Payments & Payouts.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPaymentsSectionRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/payments");
  }, [router]);
  return null;
}
