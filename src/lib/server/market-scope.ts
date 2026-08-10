/**
 * Market access scoping (server-side, service role).
 *
 * The public marketplace feed is role-aware in ONE direction only:
 *  - Motorist / guest / admin     → full market (all trades)
 *  - Repair Pro (active role)     → ONLY their primary trade's market
 *
 * The trade is derived from the REAL session (never a client param), so a
 * Repair Pro cannot widen their own feed by crafting a query param.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProService } from "@/lib/types";
import { isProService } from "@/lib/services";
import { getUserFromRequest } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * Pure decision: what trade (if any) may this actor's market feed show?
 *  - Non-repair-pro actors (motorist / guest / admin) → `null` (full market).
 *  - Repair Pros → their primary trade (or `null` when not set/unknown).
 * Extracted so unit tests can assert scoping without a DB.
 */
export function marketTradeForRole(
  role: string | null | undefined,
  primaryService: string | null | undefined
): ProService | null {
  if (role !== "repair_pro") return null;
  return primaryService && isProService(primaryService) ? primaryService : null;
}

/**
 * The viewer's active role + verified trade, resolved from the session.
 * Guests and Motorists get `null` trade (full market).
 * A Repair Pro gets their `primary_service` trade (their market is capped to it).
 */
export async function resolveMarketViewer(
  req: Request,
  sb?: SupabaseClient
): Promise<{ userId: string | null; trade: ProService | null }> {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return { userId: null, trade: null };
    const client = sb ?? createServiceSupabase();
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "repair_pro") {
      return { userId: user.id, trade: null };
    }
    // Active Repair Pro — cap the market to their primary trade.
    const { data: pro } = await client
      .from("repair_pro_profiles")
      .select("primary_service")
      .eq("user_id", user.id)
      .maybeSingle();
    return {
      userId: user.id,
      trade: marketTradeForRole("repair_pro", pro?.primary_service),
    };
  } catch {
    return { userId: null, trade: null };
  }
}