"use client";

import { useEffect, useState } from "react";
import type { CalloutQuote } from "@/lib/callout/constants";
import { apiGetCallout } from "@/lib/jobs/client";

export function useJobCallout(jobId: string | null | undefined) {
  const [quote, setQuote] = useState<CalloutQuote | null>(null);

  useEffect(() => {
    if (!jobId) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await apiGetCallout(jobId);
      if (cancelled) return;
      if (res.ok) setQuote(res.data.quote);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return quote;
}
