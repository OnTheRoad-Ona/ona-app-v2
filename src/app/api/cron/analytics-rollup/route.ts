import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Metric = {
  day: string;
  metric: string;
  value: number;
};

/**
 * Analytics daily rollup cron, pre-aggregates yesterday + today's key
 * metrics into analytics_daily_rollups so admin dashboards stop scanning
 * raw tables on every request. Safe to run multiple times (upsert).
 */
function cronAuthorized(req: Request): boolean {
  const secret =
    process.env.CRON_SECRET ||
    process.env.ONA_CRON_SECRET ||
    process.env.JOB_EXPIRE_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return apiFail("Unauthorized", 401, "unauthorized");
  if (!isSupabaseAdminConfigured())
    return apiFail("Supabase not configured", 500);

  const sb = createServiceSupabase();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const days = [dayString(yesterday), dayString(now)];
  const metrics: Metric[] = [];

  for (const day of days) {
    const start = new Date(`${day}T00:00:00Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    // Signups
    const { count: signups } = await sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());
    metrics.push({ day, metric: "signups", value: signups ?? 0 });

    // Jobs created / completed
    const { count: jobsCreated } = await sb
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());
    metrics.push({ day, metric: "jobs_created", value: jobsCreated ?? 0 });

    const { count: jobsCompleted } = await sb
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("updated_at", start.toISOString())
      .lt("updated_at", end.toISOString());
    metrics.push({ day, metric: "jobs_completed", value: jobsCompleted ?? 0 });

    // Revenue: sum of paid payments that day (scoped, one day only)
    const { data: pays } = await sb
      .from("payments")
      .select("amount_kobo")
      .eq("status", "paid")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());
    const revenue = (pays || []).reduce(
      (sum, r) => sum + (Number(r.amount_kobo) || 0),
      0,
    );
    metrics.push({ day, metric: "revenue_kobo", value: revenue });

    // Shop orders paid
    const { count: ordersPaid } = await sb
      .from("shop_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .gte("paid_at", start.toISOString())
      .lt("paid_at", end.toISOString());
    metrics.push({ day, metric: "shop_orders_paid", value: ordersPaid ?? 0 });

    // Cashouts
    const { count: cashouts } = await sb
      .from("cashout_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());
    metrics.push({ day, metric: "cashouts", value: cashouts ?? 0 });
  }

  const rows = metrics.map((m) => ({
    day: m.day,
    metric: m.metric,
    value: m.value,
    computed_at: new Date().toISOString(),
  }));
  const { error } = await sb
    .from("analytics_daily_rollups")
    .upsert(rows, { onConflict: "day,metric" });
  if (error) return apiFail(error.message, 500);

  return apiOk({ days, metrics: rows.length });
}

export async function POST(req: Request) {
  return GET(req);
}
