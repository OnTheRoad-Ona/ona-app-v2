"use client";

/**
 * Legacy route redirects to the unified Payments hub.
 * Kept so job-flow, notifications, and old deep links keep working.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PaymentHistoryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/payments");
  }, [router]);
  return null;
}
