"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PaymentsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/payments/control-center");
  }, [router]);
  return (
    <div style={{ padding: 40, color: "#6b7280", fontSize: 13 }}>
      Redirecting to Payment Control Center…
    </div>
  );
}
