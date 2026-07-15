"use client";

/**
 * Legacy track URL → premium job flow.
 * Prefer /jobs/[id] going forward.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RedirectTrack() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");

  useEffect(() => {
    if (id) router.replace(`/jobs/${id}`);
    else router.replace("/requests");
  }, [id, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm font-semibold opacity-60">
      Opening live job…
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={null}>
      <RedirectTrack />
    </Suspense>
  );
}
