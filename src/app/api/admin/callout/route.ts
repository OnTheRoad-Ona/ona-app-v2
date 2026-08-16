import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
  requireSensitiveAction,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { ALL_PRO_SERVICES, isProService } from "@/lib/services";
import { CALLOUT_FOURTEENTH_TRADE } from "@/lib/callout/constants";
import {
  loadCalloutPolicy,
  loadTradeCalloutPricing,
  saveCalloutPolicy,
  saveTradeCalloutPricing,
} from "@/lib/server/callout/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const [policy, trades] = await Promise.all([
      loadCalloutPolicy(),
      loadTradeCalloutPricing(),
    ]);
    return apiOk({
      policy,
      trades,
      fourteenthTrade: CALLOUT_FOURTEENTH_TRADE,
      tradeIds: ALL_PRO_SERVICES,
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, e.code || "auth");
    return apiFail("Failed to load call-out settings", 500);
  }
}

const policySchema = z
  .object({
    enabled: z.boolean().optional(),
    currency: z.string().min(3).max(8).optional(),
    ratePerKm: z.number().positive().max(1_000_000).optional(),
    minimumBillableDistanceKm: z.number().min(0).max(50).optional(),
    maximumRadiusKm: z.number().positive().max(50).optional(),
    billingIncrementKm: z.number().positive().max(5).optional(),
  })
  .strict();

const tradePatchSchema = z
  .object({
    tradeId: z.string(),
    baseFee: z.number().min(0).max(10_000_000).optional(),
    enabled: z.boolean().optional(),
    currency: z.string().min(3).max(8).optional(),
  })
  .strict();

const patchSchema = z
  .object({
    policy: policySchema.optional(),
    trades: z.array(tradePatchSchema).max(20).optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const body = patchSchema.safeParse(await req.json());
    if (!body.success) {
      return apiFail("Invalid call-out payload", 400, "validation");
    }
    const { session } = await requireSensitiveAction("system_settings", req);

    if (body.data.policy) {
      await saveCalloutPolicy(
        body.data.policy,
        session.userId,
        body.data.reason
      );
    }
    for (const t of body.data.trades ?? []) {
      if (!isProService(t.tradeId)) {
        return apiFail(`Unknown trade: ${t.tradeId}`, 400, "validation");
      }
      await saveTradeCalloutPricing(
        t.tradeId,
        {
          baseFee: t.baseFee,
          enabled: t.enabled,
          currency: t.currency,
        },
        session.userId,
        body.data.reason
      );
    }

    await logAdminAction(session.userId, "callout.settings_update", null, {
      sensitive: true,
      reason: body.data.reason ?? null,
    });

    const [policy, trades] = await Promise.all([
      loadCalloutPolicy(),
      loadTradeCalloutPricing(),
    ]);
    return apiOk({
      policy,
      trades,
      fourteenthTrade: CALLOUT_FOURTEENTH_TRADE,
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, e.code || "auth");
    return apiFail("Failed to save call-out settings", 500);
  }
}
