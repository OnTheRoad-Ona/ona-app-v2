import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { isProService } from "@/lib/services";
import {
  classifyRequest,
  calculateCalloutFee,
  isCalloutExcludedTrade,
} from "@/lib/callout/engine";
import {
  loadCalloutPolicy,
  loadTradeBaseFee,
} from "@/lib/server/callout/store";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { hasRecentLiveHeartbeat } from "@/lib/matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  trade: z.string(),
  lat: z.number(),
  lng: z.number(),
  proId: z.string().min(1).optional().nullable(),
  problem: z.string().max(2000).optional(),
  atWorkshop: z.boolean().optional(),
  remoteConsultation: z.boolean().optional(),
});

async function loadProCoords(proId: string) {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("repair_pro_profiles")
      .select("lat, lng, location_updated_at")
      .eq("user_id", proId)
      .maybeSingle();
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    if (!hasRecentLiveHeartbeat(data?.location_updated_at)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Server-only preview. Ignores any client fee / km / base fee.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success)
      return apiFail("Invalid preview payload", 400, "validation");
    const b = parsed.data;
    if (!isProService(b.trade))
      return apiFail("Unknown trade", 400, "validation");

    const policy = await loadCalloutPolicy();
    const classification = classifyRequest({
      problem: b.problem || "",
      selectedTrade: b.trade,
      atWorkshop: b.atWorkshop,
      remoteConsultation: b.remoteConsultation,
      policyEnabled: policy.enabled,
    });

    if (!classification.calloutEligible || !policy.enabled) {
      return apiOk({
        eligible: false,
        reason: !policy.enabled
          ? "Call-out is turned off"
          : "No travel fee for this request",
        classification,
        quote: null,
      });
    }

    const origin = b.proId ? await loadProCoords(b.proId) : null;
    if (!origin) {
      return apiOk({
        eligible: true,
        reason: "Waiting for Repair Pro location",
        classification,
        quote: null,
      });
    }

    const dest = { lat: b.lat, lng: b.lng };
    const { computeApprovedRoadRoute } =
      await import("@/lib/server/routing/approved-route");
    const road = await computeApprovedRoadRoute(origin, dest);
    if (!road.ok) {
      return apiOk({
        eligible: true,
        reason: "Waiting for a road route",
        classification,
        quote: null,
      });
    }
    const tradeFee = await loadTradeBaseFee(b.trade);
    const breakdown = calculateCalloutFee({
      tradeId: b.trade,
      approvedRouteDistanceKm: road.route.distanceKm,
      baseFee: tradeFee.baseFee,
      policy,
    });

    if (
      !breakdown.withinRadius ||
      !tradeFee.enabled ||
      isCalloutExcludedTrade(b.trade)
    ) {
      const reason = isCalloutExcludedTrade(b.trade)
        ? "This trade does not charge a call-out fee"
        : "Outside the standard call-out radius";
      return apiOk({
        eligible: false,
        reason,
        classification,
        quote: null,
        approvedRouteDistanceKm: breakdown.approvedRouteDistanceKm,
      });
    }

    return apiOk({
      eligible: true,
      reason: null,
      classification,
      quote: {
        calloutEligible: true,
        calloutStatus: "CALCULATED",
        tradeId: b.trade,
        tradeBaseFee: breakdown.tradeBaseFee,
        distanceRate: breakdown.distanceRate,
        approvedRouteDistanceKm: breakdown.approvedRouteDistanceKm,
        billableDistanceKm: breakdown.billableDistanceKm,
        distanceCharge: breakdown.distanceCharge,
        calloutFee: breakdown.calloutFee,
        currency: breakdown.currency,
        routeSource: road.route.source,
      },
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not preview call-out",
      500,
    );
  }
}
