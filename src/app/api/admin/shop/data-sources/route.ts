import { NextRequest } from "next/server";
import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { listDataSources, listImportJobs } from "@/lib/server/shop/data-sources";
import { loadConnector } from "@/lib/server/shop/connectors/types";
import { NhtsaVpicConnector } from "@/lib/server/shop/connectors/nhtsa";
import { DemoCatalogConnector } from "@/lib/server/shop/connectors/demo";
import { runImport } from "@/lib/server/shop/import-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGISTRY = {
  nhtsa_vpic: async () => new NhtsaVpicConnector(),
  ona_demo: async () => new DemoCatalogConnector(),
};

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requirePermission("shop_catalog");
    const sb = createServiceSupabase();
    const [sources, jobs] = await Promise.all([
      listDataSources(sb),
      listImportJobs(sb, { limit: 50 }),
    ]);
    return apiOk({ sources, jobs });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "admin_auth");
    const msg = e instanceof Error ? e.message : "Failed";
    return apiFail(msg, 500);
  }
}

/**
 * POST ?connector=ona_demo  → run one import job for that connector.
 * Body: { connector, jobType, actorId }
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const ctx = await requirePermission("shop_catalog");
    const body = (await req.json().catch(() => ({}))) as {
      connector?: string;
      jobType?: "full" | "incremental" | "demo" | "verify";
    };
    const code = body.connector || req.nextUrl.searchParams.get("connector");
    if (!code) return apiFail("connector code required", 400);

    const connector = await loadConnector(code, REGISTRY);
    if (!connector) return apiFail(`Unknown connector: ${code}`, 404, "UNKNOWN_CONNECTOR");

    const sb = createServiceSupabase();
    const { data: source } = await sb
      .from("shop_data_sources")
      .select("id")
      .eq("code", connector.sourceCode)
      .maybeSingle();
    const sourceId = source ? String(source.id) : null;

    const { data: connRow } = await sb
      .from("shop_source_connectors")
      .select("id")
      .eq("code", connector.code)
      .maybeSingle();
    const connectorId = connRow ? String(connRow.id) : null;

    const result = await runImport({
      sb,
      connector,
      sourceId,
      connectorId,
      actorId: ctx.session.userId,
      jobType: body.jobType ?? "full",
    });

    return apiOk(result, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "admin_auth");
    const msg = e instanceof Error ? e.message : "Import failed";
    return apiFail(msg, 500);
  }
}
