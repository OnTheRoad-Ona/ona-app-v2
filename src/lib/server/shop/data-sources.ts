/**
 * ONA Shop data source reporting (Phase 2).
 * Read-side: sources, connectors, jobs, batches, staging status.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DataSourceReport = {
  id: string;
  code: string;
  name: string;
  kind: string;
  license: string | null;
  licenseUrl: string | null;
  homepageUrl: string | null;
  status: string;
  enabled: boolean;
  recordsDiscovered: number;
  recordsImported: number;
  recordsRejected: number;
  recordsUpdated: number;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  connectors: Array<{
    id: string;
    code: string;
    name: string;
    connectorType: string;
    status: string;
    recordsDiscovered: number;
    recordsImported: number;
    recordsRejected: number;
    recordsUpdated: number;
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    lastError: string | null;
  }>;
};

export async function listDataSources(
  sb: SupabaseClient,
): Promise<DataSourceReport[]> {
  const { data: sources, error } = await sb
    .from("shop_data_sources")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: connectors } = await sb
    .from("shop_source_connectors")
    .select("*")
    .order("name", { ascending: true });

  const bySource = new Map<string, DataSourceReport["connectors"]>();
  for (const c of connectors ?? []) {
    const key = String(c.data_source_id);
    const arr = bySource.get(key) ?? [];
    arr.push({
      id: String(c.id),
      code: String(c.code),
      name: String(c.name),
      connectorType: String(c.connector_type),
      status: String(c.status),
      recordsDiscovered: Number(c.records_discovered ?? 0),
      recordsImported: Number(c.records_imported ?? 0),
      recordsRejected: Number(c.records_rejected ?? 0),
      recordsUpdated: Number(c.records_updated ?? 0),
      lastSyncAt: c.last_sync_at ? String(c.last_sync_at) : null,
      nextSyncAt: c.next_sync_at ? String(c.next_sync_at) : null,
      lastError: c.last_error ? String(c.last_error) : null,
    });
    bySource.set(key, arr);
  }

  return (sources ?? []).map((s) => ({
    id: String(s.id),
    code: String(s.code),
    name: String(s.name),
    kind: String(s.kind),
    license: s.license ? String(s.license) : null,
    licenseUrl: s.license_url ? String(s.license_url) : null,
    homepageUrl: s.homepage_url ? String(s.homepage_url) : null,
    status: String(s.status),
    enabled: Boolean(s.enabled),
    recordsDiscovered: Number(s.records_discovered ?? 0),
    recordsImported: Number(s.records_imported ?? 0),
    recordsRejected: Number(s.records_rejected ?? 0),
    recordsUpdated: Number(s.records_updated ?? 0),
    lastSyncAt: s.last_sync_at ? String(s.last_sync_at) : null,
    nextSyncAt: s.next_sync_at ? String(s.next_sync_at) : null,
    lastError: s.last_error ? String(s.last_error) : null,
    connectors: bySource.get(String(s.id)) ?? [],
  }));
}

export async function listImportJobs(
  sb: SupabaseClient,
  opts?: { limit?: number },
) {
  const { data, error } = await sb
    .from("shop_import_jobs")
    .select(
      "id, job_type, status, records_discovered, records_imported, records_updated, records_rejected, error_summary, started_at, finished_at, created_at, data_sources(id, code, name)",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(opts?.limit ?? 50, 200));
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listStagingSummary(
  sb: SupabaseClient,
  jobId: string,
): Promise<{ counts: Record<string, number>; records: unknown[] }> {
  const { data: records, error } = await sb
    .from("shop_staging_records")
    .select("status, id, external_id, external_category")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const r of records ?? []) {
    const s = String(r.status);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return { counts, records: records ?? [] };
}
