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

/**
 * Shop UI + API scope (Mechanic Shop architecture).
 * Customer → full market. Mechanic pro → Mechanic Shop only.
 * Browse ALL PARTS is allowed for Mechanic pro only (and customers).
 */
export type ShopUiScope = {
  accountContext: "motorist" | "professional";
  proTrade: ProService | null;
  /** null = all trades (customer). */
  allowedTradeKeys: string[] | null;
  shopTitle: string;
  allowBrowseAllParts: boolean;
  defaultTradeKey: string | null;
};

export function shopUiScopeFromViewer(viewer: {
  trade: ProService | null;
  isPro: boolean;
}): ShopUiScope {
  if (!viewer.isPro) {
    return {
      accountContext: "motorist",
      proTrade: null,
      allowedTradeKeys: null,
      shopTitle: "Shop",
      allowBrowseAllParts: true,
      defaultTradeKey: null,
    };
  }
  const trade = viewer.trade;
  if (trade === "mechanic") {
    return {
      accountContext: "professional",
      proTrade: "mechanic",
      allowedTradeKeys: ["mechanic"],
      shopTitle: "Mechanic Shop",
      allowBrowseAllParts: true,
      defaultTradeKey: "mechanic",
    };
  }
  if (trade) {
    return {
      accountContext: "professional",
      proTrade: trade,
      allowedTradeKeys: [trade],
      shopTitle: `${trade.charAt(0).toUpperCase()}${trade.slice(1)} Shop`,
      allowBrowseAllParts: false,
      defaultTradeKey: trade,
    };
  }
  return {
    accountContext: "professional",
    proTrade: null,
    allowedTradeKeys: [],
    shopTitle: "Shop",
    allowBrowseAllParts: false,
    defaultTradeKey: null,
  };
}

export async function resolveShopUiScope(req: Request): Promise<ShopUiScope> {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return shopUiScopeFromViewer({ trade: null, isPro: false });
    const client = createServiceSupabase();
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "repair_pro") {
      return shopUiScopeFromViewer({ trade: null, isPro: false });
    }
    const { data: pro } = await client
      .from("repair_pro_profiles")
      .select("primary_service")
      .eq("user_id", user.id)
      .maybeSingle();
    const trade = marketTradeForRole("repair_pro", pro?.primary_service);
    return shopUiScopeFromViewer({ trade, isPro: true });
  } catch {
    return shopUiScopeFromViewer({ trade: null, isPro: false });
  }
}

/** Deny unauthorized trade catalog access (API security). */
export function assertTradeAllowed(
  scope: ShopUiScope,
  tradeKey: string
): { ok: true } | { ok: false; message: string; code: string } {
  if (!scope.allowedTradeKeys) return { ok: true };
  if (scope.allowedTradeKeys.includes(tradeKey)) return { ok: true };
  return {
    ok: false,
    message: `Trade catalog "${tradeKey}" is not available in this shop session`,
    code: "TRADE_FORBIDDEN",
  };
}