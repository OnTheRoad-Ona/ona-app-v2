import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  AdminAuthError,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: list zero-result product requests (demand intelligence). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status") || "open";
    const sb = createServiceSupabase();
    let q = sb
      .from("shop_product_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    // Aggregate repeated terms
    const counts = new Map<string, number>();
    for (const r of data ?? []) {
      const t = String(r.search_term || "").toLowerCase();
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    const topTerms = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([term, count]) => ({ term, count }));

    return apiOk({ requests: data ?? [], topTerms });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    const msg = e instanceof Error ? e.message : "Failed";
    return apiFail(msg, 500, "ADMIN_PRODUCT_REQUESTS");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json()) as {
      id?: string;
      status?: string;
      adminNotes?: string;
    };
    if (!body.id) return apiFail("id required", 400);
    const sb = createServiceSupabase();
    const { error } = await sb
      .from("shop_product_requests")
      .update({
        status: body.status || "reviewing",
        admin_notes: body.adminNotes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id);
    if (error) throw new Error(error.message);
    return apiOk({ updated: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    const msg = e instanceof Error ? e.message : "Failed";
    return apiFail(msg, 500, "ADMIN_PRODUCT_REQUESTS");
  }
}
