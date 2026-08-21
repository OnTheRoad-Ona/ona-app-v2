"use client";

import { useEffect, useState } from "react";
import type { CalloutQuote } from "@/lib/callout/constants";
import { isCalloutAmountReady } from "@/lib/callout/payable";
import { apiGetCallout } from "@/lib/jobs/client";

/** Final states — stop polling once the quote settles. */
const FINAL_QUOTE_STATUSES = new Set(["LOCKED", "NOT_ELIGIBLE", "CANCELLED", "DISPUTED"]);

const quoteCache = new Map<string, CalloutQuote>();

export function resetCalloutQuoteCache() {
  quoteCache.clear();
}

function seedQuote(
  jobId: string | null | undefined,
  seed?: CalloutQuote | null
): CalloutQuote | null {
  if (seed && jobId && isCalloutAmountReady(seed)) quoteCache.set(jobId, seed);
  if (seed && isCalloutAmountReady(seed)) return seed;
  if (jobId) {
    const hit = quoteCache.get(jobId);
    if (hit && isCalloutAmountReady(hit)) return hit;
  }
  return null;
}

export function useJobCallout(
  jobId: string | null | undefined,
  status?: string | null,
  seed?: CalloutQuote | null
): { quote: CalloutQuote | null; ready: boolean } {
  const seeded = seedQuote(jobId, seed);
  const [fetched, setFetched] = useState<CalloutQuote | null>(null);
  const quote = fetched && isCalloutAmountReady(fetched) ? fetched : seeded;
  const ready = isCalloutAmountReady(quote);

  useEffect(() => {
    if (!jobId) {
      setFetched(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fetchQuote = async () => {
      try {
        const res = await apiGetCallout(jobId);
        if (cancelled) return;
        if (res.ok && res.data.quote && isCalloutAmountReady(res.data.quote)) {
          quoteCache.set(jobId, res.data.quote);
          setFetched(res.data.quote);
        }
        const q = res.ok ? res.data.quote : null;
        if (q && FINAL_QUOTE_STATUSES.has(q.calloutStatus)) {
          return;
        }
      } catch {
        /* retry */
      }
      timer = setTimeout(fetchQuote, 3000);
    };
    void fetchQuote();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, status]);

  return { quote, ready };
}
