/**
 * Server-side health aggregation for OgaMecho.
 * INTEGRATION: swap storage estimate for real Supabase/Postgres size queries.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  assembleSnapshot,
  STORAGE_CRIT_PCT,
  STORAGE_WARN_PCT,
} from "@/lib/health-checks";
import type {
  HealthLog,
  HealthIssueType,
  HealthSeverity,
  HealthSource,
  HealthSnapshot,
  LogErrorPayload,
} from "@/types/health";

const VALID_TYPES: HealthIssueType[] = [
  "Auth Error",
  "Database Storage Low",
  "Map Error",
  "API Error",
  "Frontend Error",
  "Performance Warning",
  "Connection Issue",
];

function rowToLog(row: Record<string, unknown>): HealthLog {
  return {
    id: String(row.id),
    timestamp: String(row.created_at || row.timestamp || new Date().toISOString()),
    type: row.type as HealthIssueType,
    severity: (row.severity as HealthSeverity) || "warning",
    message: String(row.message || ""),
    source: (row.source as HealthSource) || "system",
    resolved: Boolean(row.resolved),
    metadata: (row.metadata as Record<string, unknown>) || null,
  };
}

/**
 * Estimate DB storage % used.
 *
 * REAL SUPABASE / POSTGRES (service role / superuser):
 *   SELECT
 *     pg_database_size(current_database()) AS used_bytes,
 *     -- Plan limit is not in Postgres; store in app_settings or env DB_STORAGE_LIMIT_BYTES
 *     ...
 *
 * For managed Supabase free tier, approximate with table sizes:
 *   SELECT sum(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(tablename)))
 *   FROM pg_tables WHERE schemaname = 'public';
 *
 * Here we use a lightweight heuristic from row counts + optional env limit.
 */
export async function estimateStoragePct(): Promise<{
  pct: number;
  live: boolean;
  connected: boolean;
  detail?: string;
}> {
  if (!isSupabaseAdminConfigured()) {
    return { pct: 0, live: false, connected: false, detail: "Supabase not configured" };
  }
  try {
    const sb = createServiceSupabase();
    // Connectivity probe
    const { error: pingErr } = await sb.from("profiles").select("id", {
      count: "exact",
      head: true,
    });
    if (pingErr) {
      return {
        pct: 0,
        live: false,
        connected: false,
        detail: pingErr.message,
      };
    }

    // Heuristic: sum approximate row counts across core tables
    // INTEGRATION: replace with pg_database_size + plan limit from Supabase dashboard API
    // Use * for count — some tables use user_id PK (not id)
    const tables = [
      "profiles",
      "motorist_profiles",
      "repair_pro_profiles",
      "service_requests",
      "signup_events",
      "app_health_logs",
    ] as const;
    let totalRows = 0;
    for (const t of tables) {
      const { count } = await sb
        .from(t)
        .select("*", { count: "exact", head: true });
      totalRows += count ?? 0;
    }
    // Assume ~500 bytes/row avg + 200MB baseline → map to % of 500MB free-tier-ish budget
    const limitBytes =
      Number(process.env.DB_STORAGE_LIMIT_BYTES) || 500 * 1024 * 1024;
    const estimatedBytes = 50 * 1024 * 1024 + totalRows * 800;
    const pct = Math.min(99.9, (estimatedBytes / limitBytes) * 100);

    return {
      pct,
      live: false, // set true when using real pg_database_size
      connected: true,
      detail: `Heuristic from ${totalRows} rows across core tables`,
    };
  } catch (e) {
    return {
      pct: 0,
      live: false,
      connected: false,
      detail: e instanceof Error ? e.message : "DB probe failed",
    };
  }
}

/** Real rows only from app_health_logs — never invents demo issues. */
export async function fetchHealthLogs(limit = 100): Promise<HealthLog[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("app_health_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data?.length) return [];
    return data.map((r) => rowToLog(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function insertHealthLog(
  payload: LogErrorPayload
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!VALID_TYPES.includes(payload.type)) {
    return { ok: false, error: "Invalid issue type" };
  }
  if (!payload.message?.trim()) {
    return { ok: false, error: "Message required" };
  }
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Database not configured" };
  }
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("app_health_logs")
      .insert({
        type: payload.type,
        severity: payload.severity || "warning",
        message: payload.message.trim().slice(0, 2000),
        source: payload.source || "system",
        resolved: false,
        metadata: payload.metadata || {},
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Insert failed",
    };
  }
}

export async function setHealthLogResolved(
  id: string,
  resolved: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Database not configured" };
  }
  const sb = createServiceSupabase();
  const { error } = await sb
    .from("app_health_logs")
    .update({ resolved })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Auto-log storage threshold events when checking health */
async function maybeLogStorageThreshold(pct: number) {
  if (pct < STORAGE_WARN_PCT) return;
  const severity: HealthSeverity =
    pct >= STORAGE_CRIT_PCT ? "critical" : "warning";
  await insertHealthLog({
    type: "Database Storage Low",
    severity,
    message: `Database storage estimated at ${pct.toFixed(1)}% used (warn ${STORAGE_WARN_PCT}% / crit ${STORAGE_CRIT_PCT}%).`,
    source: "database",
    metadata: { storagePctUsed: pct, auto: true },
  });
}

export async function runFullHealthCheck(): Promise<HealthSnapshot> {
  const t0 = Date.now();
  const storage = await estimateStoragePct();
  if (storage.connected && storage.pct >= STORAGE_WARN_PCT) {
    // Avoid spamming: only log if no identical auto event in last 30 min
    const logs = await fetchHealthLogs(20);
    const recent = logs.find(
      (l) =>
        l.type === "Database Storage Low" &&
        l.metadata?.auto === true &&
        Date.now() - new Date(l.timestamp).getTime() < 30 * 60_000
    );
    if (!recent) await maybeLogStorageThreshold(storage.pct);
  }

  const logs = await fetchHealthLogs(150);
  const avgResponseMs = Date.now() - t0; // proxy: health pipeline latency
  const mapsLive = process.env.NEXT_PUBLIC_USE_LIVE_MAPS !== "false";

  return assembleSnapshot({
    logs,
    dbConnected: storage.connected,
    storagePctUsed: storage.connected ? storage.pct : 0,
    storageLive: storage.live,
    mapsLive: mapsLive && Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    avgResponseMs,
  });
}
