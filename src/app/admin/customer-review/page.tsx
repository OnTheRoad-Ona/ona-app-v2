"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Merged into /admin/motorists (Customers hub · ID review tab) */
export default function CustomerReviewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/motorists?tab=id_review");
  }, [router]);
  return (
    <p style={{ padding: 24, fontFamily: "system-ui" }}>
      Redirecting to Customers · ID review…
    </p>
  );
}
