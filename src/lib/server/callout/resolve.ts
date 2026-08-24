import type { CalloutQuote } from "@/lib/callout/constants";
import type { JobRecord } from "@/lib/jobs/types";
import { estimateCalloutQuote } from "@/lib/server/callout/estimate";
import { getCalloutQuote } from "@/lib/server/callout/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

/**
 * Stored quote if it can already be shown; otherwise a deterministic
 * estimate so the ₦ total does not flash labour-only.
 */
export async function resolveJobCalloutQuote(
  job: JobRecord,
): Promise<CalloutQuote | null> {
  const stored = await getCalloutQuote(job.id);
  if (
    stored &&
    stored.calloutStatus !== "PENDING" &&
    stored.calloutStatus !== "CALCULATING"
  ) {
    return stored;
  }
  if (
    !stored ||
    stored.calloutStatus === "PENDING" ||
    !isSupabaseAdminConfigured()
  ) {
    return (await estimateCalloutQuote(job, stored)) ?? stored;
  }
  return stored;
}
