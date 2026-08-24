import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zero-result demand intelligence.
 * POST { searchTerm, tradeKey?, vehicleContext?, notify?, location? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      searchTerm?: string;
      tradeKey?: string;
      vehicleContext?: Record<string, unknown>;
      notify?: boolean;
      location?: string;
    };
    const term = (body.searchTerm || "").trim();
    if (!term || term.length < 2) {
      return apiFail("searchTerm required", 400, "VALIDATION");
    }
    const user = await getUserFromRequest(req);
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("shop_product_requests")
      .insert({
        user_id: user?.id ?? null,
        trade_key: body.tradeKey || "mechanic",
        search_term: term.slice(0, 200),
        vehicle_context: body.vehicleContext || {},
        location: body.location || null,
        notify_requested: Boolean(body.notify),
        status: "open",
      })
      .select("id")
      .single();
    if (error) {
      if (
        /relation .* does not exist|Could not find the table/i.test(
          error.message,
        )
      ) {
        return apiFail(
          "Product requests table not migrated (run 061)",
          503,
          "SETUP_REQUIRED",
        );
      }
      throw new Error(error.message);
    }
    return apiOk({
      id: data?.id,
      message: "Request recorded for Admin review",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return apiFail(msg, 500, "PRODUCT_REQUEST_ERROR");
  }
}
