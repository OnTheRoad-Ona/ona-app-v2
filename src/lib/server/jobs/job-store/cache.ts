import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { JobRecord } from "@/lib/jobs/types";
import { memory, READ_CACHE_MS } from "./constants";
import { jobToDbPatch, flowToLegacyStatus, nowIso } from "./mappers";

export function cacheJob(job: JobRecord): JobRecord {
  memory.set(job.id, job);
  if (memory.size > 512) {
    const now = Date.now();
    for (const [k, v] of memory) {
      const at = v.updatedAt ? new Date(v.updatedAt).getTime() : Number.NaN;
      if (!Number.isFinite(at) || now - at > 5 * 60 * 1000) {
        memory.delete(k);
      }
    }
  }
  return job;
}

export async function persist(job: JobRecord): Promise<JobRecord> {
  cacheJob(job);
  if (!isSupabaseAdminConfigured()) return job;
  try {
    const sb = createServiceSupabase();
    const patch = jobToDbPatch(job);
    const { error } = await sb
      .from("service_requests")
      .update(patch)
      .eq("id", job.id);
    if (error) {
      console.error("job persist failed", job.id, job.status, error.message);
      const { error: e2 } = await sb
        .from("service_requests")
        .update({
          flow_status: job.status,
          status: flowToLegacyStatus(job.status),
          pickup_lat: job.motoristLocation?.lat ?? null,
          pickup_lng: job.motoristLocation?.lng ?? null,
          pro_lat: job.proLocation?.lat ?? null,
          pro_lng: job.proLocation?.lng ?? null,
          eta_minutes: job.etaMinutes ?? null,
          distance_km: job.distanceKm ?? null,
          status_history: job.statusHistory,
          updated_at: job.updatedAt,
        })
        .eq("id", job.id);
      if (e2) {
        console.error("job persist minimal failed", e2.message);
        const { error: e3 } = await sb
          .from("service_requests")
          .update({
            flow_status: job.status,
            updated_at: job.updatedAt,
          })
          .eq("id", job.id);
        if (e3) {
          console.error("job persist flow_status failed", e3.message);
          throw new Error(
            `Could not save trip status (${job.status}). ${e3.message}`,
          );
        }
      }
    }
    try {
      await sb.from("job_events").insert({
        request_id: job.id,
        event_type: "status",
        payload: { status: job.status },
      });
    } catch {
      /* optional table */
    }
  } catch (e) {
    console.error("job persist exception", e);
    if (e instanceof Error && e.message.startsWith("Could not save")) {
      throw e;
    }
  }
  return job;
}

export async function persistIfUnchanged(
  job: JobRecord,
  expectedUpdatedAt: string,
): Promise<JobRecord | null> {
  if (!isSupabaseAdminConfigured()) {
    cacheJob(job);
    return job;
  }
  try {
    const sb = createServiceSupabase();
    const patch = jobToDbPatch(job);
    const { data, error } = await sb
      .from("service_requests")
      .update(patch)
      .eq("id", job.id)
      .eq("updated_at", expectedUpdatedAt)
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    const saved = await persist(job);
    return saved;
  } catch {
    return null;
  }
}
