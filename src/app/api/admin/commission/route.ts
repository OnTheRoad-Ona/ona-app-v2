import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfDay(d: Date): string {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

function startOfWeek(d: Date): string {
  const x = new Date(d);
  const day = x.getUTCDay();
  const diff = x.getUTCDate() - day + (day === 0 ? -6 : 1);
  x.setUTCDate(diff);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

function startOfMonth(d: Date): string {
  const x = new Date(d);
  x.setUTCDate(1);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

function startOfYear(d: Date): string {
  const x = new Date(d);
  x.setUTCMonth(0, 1);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

function ytdRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: startOfYear(now),
    to: now.toISOString(),
  };
}

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requirePermission("view_payment_status");

    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "day";
    const from = url.searchParams.get("from") || startOfDay(new Date(Date.now() - 30 * 86400000));
    const to = url.searchParams.get("to") || new Date().toISOString();

    const supabase = createServiceSupabase();

    // YTD: always compute year-to-date totals regardless of period
    const ytd = ytdRange();
    const { data: ytdRows } = await supabase
      .from("payments")
      .select("platform_fee_kobo, pro_payout_kobo, amount_kobo")
      .eq("escrow_status", "released")
      .gte("released_at", ytd.from)
      .lte("released_at", ytd.to)
      .limit(9999);

    const ytdTotalCommissionMinor = (ytdRows ?? []).reduce(
      (a, r) => a + (Number(r.platform_fee_kobo) || 0), 0
    );
    const ytdTotalPayoutMinor = (ytdRows ?? []).reduce(
      (a, r) => a + (Number(r.pro_payout_kobo) || 0), 0
    );
    const ytdTotalRevenueMinor = (ytdRows ?? []).reduce(
      (a, r) => a + (Number(r.amount_kobo) || 0), 0
    );

    const { data, error } = await supabase
      .from("payments")
      .select("platform_fee_kobo, pro_payout_kobo, amount_kobo, escrow_status, released_at, updated_at, created_at, currency, service_type")
      .eq("escrow_status", "released")
      .gte("released_at", from)
      .lte("released_at", to)
      .order("released_at", { ascending: false })
      .limit(2000);

    if (error) return apiFail(error.message, 500);

    const rows = (data ?? []) as Record<string, unknown>[];

    const totalCommissionMinor = rows.reduce(
      (a, r) => a + (Number(r.platform_fee_kobo) || 0), 0
    );
    const totalPayoutMinor = rows.reduce(
      (a, r) => a + (Number(r.pro_payout_kobo) || 0), 0
    );
    const totalRevenueMinor = rows.reduce(
      (a, r) => a + (Number(r.amount_kobo) || 0), 0
    );

    const byPeriod: Record<string, { count: number; commissionMinor: number; revenueMinor: number; payoutMinor: number }> = {};
    for (const r of rows) {
      const d = new Date(String(r.released_at || r.updated_at || r.created_at));
      const key = period === "year" ? startOfYear(d)
        : period === "month" ? startOfMonth(d)
        : period === "week" ? startOfWeek(d)
        : startOfDay(d);
      if (!byPeriod[key]) byPeriod[key] = { count: 0, commissionMinor: 0, revenueMinor: 0, payoutMinor: 0 };
      byPeriod[key].count += 1;
      byPeriod[key].commissionMinor += Number(r.platform_fee_kobo) || 0;
      byPeriod[key].revenueMinor += Number(r.amount_kobo) || 0;
      byPeriod[key].payoutMinor += Number(r.pro_payout_kobo) || 0;
    }

    const breakdown = Object.entries(byPeriod)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));

    return apiOk({
      totalCommissionMinor,
      totalPayoutMinor,
      totalRevenueMinor,
      transactionCount: rows.length,
      period,
      from,
      to,
      breakdown,
      ytd: {
        totalCommissionMinor: ytdTotalCommissionMinor,
        totalPayoutMinor: ytdTotalPayoutMinor,
        totalRevenueMinor: ytdTotalRevenueMinor,
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Commission report failed", 500);
  }
}
