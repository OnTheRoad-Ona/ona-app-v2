import type { JobRecord } from "@/lib/jobs/types";
import type { JobMedia } from "@/lib/jobs/types";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { memory, READ_CACHE_MS, LEAN_JOB_COLUMNS, PRO_ACTIONABLE_LIST_STATUSES } from "./constants";
import { rowToJob, flowToLegacyStatus, nowIso } from "./mappers";
import { cacheJob, persist } from "./cache";
import { hydrateJobContacts, hydrateJobCallout } from "./hydrate";

async function getJobRaw(id: string): Promise<JobRecord | null> {
  const fast = memory.get(id);
  if (fast) {
    const at = fast.updatedAt ? new Date(fast.updatedAt).getTime() : Number.NaN;
    if (Number.isFinite(at) && Date.now() - at < READ_CACHE_MS) {
      if (fast.agreedMajor != null && !fast.calloutQuote && !fast.callout_quote) {
        const hydrated = await hydrateJobCallout(fast);
        if (hydrated !== fast) {
          memory.set(id, hydrated);
          return hydrated;
        }
      }
      return fast;
    }
    memory.delete(id);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("service_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (data) {
        let job = rowToJob(data as Record<string, unknown>);
        const memHit = memory.get(id);
        if (!job.motoristVehicle?.trim() && memHit?.motoristVehicle) {
          job = { ...job, motoristVehicle: memHit.motoristVehicle };
        }
        job = await hydrateJobContacts(job);
        job = await hydrateJobCallout(job);
        memory.set(id, job);
        return job;
      }
    } catch {
      /* memory */
    }
  }
  const mem = memory.get(id);
  if (!mem) return null;
  let hydrated = await hydrateJobContacts(mem);
  hydrated = await hydrateJobCallout(hydrated);
  return hydrated;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const job = await getJobRaw(id);
  if (!job) return null;
  const { reconcileJobPayment } = await import("./payments");
  const { recoverReleasedFromFlutterwave } = await import("./recovery");
  const { clearFalseSatisfiedStamp } = await import("./recovery");
  const { maybeExpire } = await import("./expiry");
  const synced = await reconcileJobPayment(job);
  const recovered = await recoverReleasedFromFlutterwave(synced);
  const cleaned = await clearFalseSatisfiedStamp(recovered);
  return maybeExpire(cleaned);
}

function isDeferredByPro(job: JobRecord, proId: string): boolean {
  const DEFER_DURATION_MS = 5 * 60_000;
  let latest: number | null = null;
  for (const h of job.statusHistory || []) {
    if (h.by === `deferred:${proId}`) {
      const t = Date.parse(h.at);
      if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
    }
  }
  if (latest === null) return false;
  return Date.now() - latest < DEFER_DURATION_MS;
}

async function attachSettledCalloutQuotes(
  jobs: JobRecord[],
): Promise<JobRecord[]> {
  const need = jobs.filter((j) => j.agreedMajor != null).slice(0, 12);
  if (!need.length) return jobs;
  try {
    const { resolveJobCalloutQuote } =
      await import("@/lib/server/callout/resolve");
    const pairs = await Promise.all(
      need.map(async (j) => {
        try {
          return [j.id, await resolveJobCalloutQuote(j)] as const;
        } catch {
          return [j.id, null] as const;
        }
      }),
    );
    const map = new Map(pairs);
    return jobs.map((j) =>
      map.has(j.id) ? { ...j, calloutQuote: map.get(j.id) ?? null } : j,
    );
  } catch {
    return jobs;
  }
}

export async function listJobsForUser(
  userId: string,
  role: "motorist" | "repair_pro",
  opts?: { lean?: boolean },
): Promise<JobRecord[]> {
  if (opts?.lean) {
    return listJobsForUserLean(userId, role);
  }
  const out: JobRecord[] = [];
  for (const j of memory.values()) {
    if (role === "motorist" && j.motoristId === userId) out.push(j);
    if (role === "repair_pro" && j.repairProId === userId) {
      if (isDeferredByPro(j, userId)) continue;
      out.push(j);
    }
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const col = role === "motorist" ? "motorist_id" : "repair_pro_id";
      const { data } = await sb
        .from("service_requests")
        .select(LEAN_JOB_COLUMNS)
        .eq(col, userId)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(40);
      let rows = data || [];
      if (role === "repair_pro") {
        const { data: openData } = await sb
          .from("service_requests")
          .select(LEAN_JOB_COLUMNS)
          .eq("repair_pro_id", userId)
          .in("status", PRO_ACTIONABLE_LIST_STATUSES);
        const openArr = openData || [];
        if (openArr.length > 0) {
          const idOf = (r: { id?: unknown }) => String(r.id);
          const openSet = new Set(
            openArr.map((r) => idOf(r as { id?: unknown })),
          );
          rows = [
            ...openArr,
            ...rows.filter((r) => !openSet.has(idOf(r as { id?: unknown }))),
          ];
        }
      }
      let mapped = await Promise.all(
        rows.map(async (row) => {
          let j = rowToJob(row as unknown as Record<string, unknown>);
          if (
            j.status === "negotiating" ||
            j.status === "agreed" ||
            j.status === "paid_booked" ||
            j.status === "en_route" ||
            j.status === "arrived" ||
            j.status === "in_progress" ||
            j.status === "completed" ||
            j.status === "searching"
          ) {
            try {
              const { maybeExpire } = await import("./expiry");
              j = await maybeExpire(j);
            } catch {
              /* keep raw row */
            }
          }
          return j;
        }),
      );

      if (role === "repair_pro") {
        const needPhoto = mapped.filter(
          (j) =>
            !j.motoristPhoto?.trim() &&
            j.motoristId &&
            [
              "waiting_for_selected",
              "selected_review",
              "waiting_for_pro",
              "reserved",
              "negotiating",
              "agreed",
            ].includes(j.status),
        );
        const ids = [
          ...new Set(needPhoto.map((j) => j.motoristId).filter(Boolean)),
        ];
        if (ids.length) {
          try {
            const { data: profiles } = await sb
              .from("profiles")
              .select("id, avatar_url")
              .in("id", ids);
            const byId = new Map(
              (profiles || [])
                .filter((p) => p.avatar_url)
                .map((p) => [String(p.id), String(p.avatar_url)]),
            );
            if (byId.size) {
              mapped = mapped.map((j) => {
                if (j.motoristPhoto?.trim()) return j;
                const url = byId.get(j.motoristId);
                return url ? { ...j, motoristPhoto: url } : j;
              });
            }
          } catch {
            /* optional */
          }
        }
      }

      if (role === "repair_pro") {
        const needMedia = mapped.filter((j) =>
          [
            "waiting_for_selected",
            "selected_review",
            "waiting_for_pro",
            "reserved",
            "sequential_pairing",
            "negotiating",
            "agreed",
          ].includes(j.status),
        );
        const mediaIds = [
          ...new Set(needMedia.map((j) => j.id).filter(Boolean)),
        ];
        if (mediaIds.length) {
          try {
            const { data: mediaRows } = await sb
              .from("service_requests")
              .select("id, photos, voice_note")
              .in("id", mediaIds);
            const mediaById = new Map(
              (mediaRows || []).map((r) => [String(r.id), r]),
            );
            if (mediaById.size) {
              mapped = mapped.map((j) => {
                const m = mediaById.get(j.id);
                if (!m) return j;
                return {
                  ...j,
                  photos: (m.photos as JobMedia[]) || j.photos,
                  voiceNote: (m.voice_note as JobMedia) || j.voiceNote,
                };
              });
            }
          } catch {
            /* media is optional */
          }
        }
      }

      for (const j of mapped) {
        if (role === "repair_pro" && isDeferredByPro(j, userId)) continue;
        if (!out.find((x) => x.id === j.id)) out.push(j);
      }
    } catch {
      /* */
    }
  }
  const KEEP_MEDIA_STATUSES = new Set<string>([
    "waiting_for_selected",
    "selected_review",
    "waiting_for_pro",
    "reserved",
    "sequential_pairing",
    "negotiating",
    "agreed",
  ]);

  const listed = out
    .filter((j) => {
      if (!j.motoristId || !j.problem?.trim()) return false;
      return true;
    })
    .map((j) => {
      if (role === "repair_pro" && KEEP_MEDIA_STATUSES.has(j.status)) {
        return j;
      }
      return { ...j, photos: [], voiceNote: null };
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );
  return attachSettledCalloutQuotes(listed);
}

async function listJobsForUserLean(
  userId: string,
  role: "motorist" | "repair_pro",
): Promise<JobRecord[]> {
  const out: JobRecord[] = [];
  for (const j of memory.values()) {
    if (role === "motorist" && j.motoristId === userId) out.push(j);
    if (role === "repair_pro" && j.repairProId === userId) {
      if (isDeferredByPro(j, userId)) continue;
      out.push(j);
    }
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const col = role === "motorist" ? "motorist_id" : "repair_pro_id";
      const { data } = await sb
        .from("service_requests")
        .select(LEAN_JOB_COLUMNS)
        .eq(col, userId)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(40);
      let rows = data || [];
      if (role === "repair_pro") {
        const { data: openData } = await sb
          .from("service_requests")
          .select(LEAN_JOB_COLUMNS)
          .eq("repair_pro_id", userId)
          .in("flow_status", PRO_ACTIONABLE_LIST_STATUSES);
        const openArr = openData || [];
        if (openArr.length > 0) {
          const idOf = (r: { id?: unknown }) => String(r.id);
          const openSet = new Set(
            openArr.map((r) => idOf(r as { id?: unknown })),
          );
          rows = [
            ...openArr,
            ...rows.filter((r) => !openSet.has(idOf(r as { id?: unknown }))),
          ];
        }
      }
      const mapped = rows.map((row) =>
        rowToJob(row as unknown as Record<string, unknown>),
      );
      for (const j of mapped) {
        if (role === "repair_pro" && isDeferredByPro(j, userId)) continue;
        if (!out.find((x) => x.id === j.id)) out.push(j);
      }
    } catch {
      /* fall back to memory */
    }
  }
  const leanWithCallout = await attachSettledCalloutQuotes(out);
  return leanWithCallout;
}

export async function listDisputedJobs(): Promise<JobRecord[]> {
  const all: JobRecord[] = [];
  for (const j of memory.values()) {
    if (j.status === "disputed" || j.status === "under_appeal") all.push(j);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("service_requests")
        .select("*")
        .in("flow_status", ["disputed", "under_appeal"])
        .order("updated_at", { ascending: false })
        .limit(100);
      for (const row of data || []) {
        const j = rowToJob(row as Record<string, unknown>);
        if (!all.find((x) => x.id === j.id)) all.push(j);
      }
    } catch {
      /* */
    }
  }
  return all;
}

export function publicJobView(job: JobRecord): Partial<JobRecord> {
  return {
    id: job.id,
    status: job.status,
    serviceType: job.serviceType,
    problem: job.problem,
    locationLabel: job.locationLabel,
    motoristLocation: job.motoristLocation,
    motoristName: job.motoristName,
    motoristPhoto: job.motoristPhoto,
    motoristVehicle: job.motoristVehicle,
    repairProName: job.repairProName,
    repairProPhoto: job.repairProPhoto,
    agreedMajor: job.agreedMajor,
    currency: job.currency,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    rating: job.rating,
    ratingNote: job.ratingNote,
  };
}

export { getJobRaw, isDeferredByPro };
