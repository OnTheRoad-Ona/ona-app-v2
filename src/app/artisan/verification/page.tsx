"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArtisanOnboarding } from "@/components/artisan/artisan-onboarding";

function VerificationInner() {
  const sp = useSearchParams();
  const viewOnly = sp.get("view") === "1";
  return <ArtisanOnboarding mode="settings" viewOnly={viewOnly} />;
}

/** Complete optional tiers later from profile (or view-only when ?view=1) */
export default function ArtisanVerificationPage() {
  return (
    <Suspense fallback={null}>
      <VerificationInner />
    </Suspense>
  );
}
