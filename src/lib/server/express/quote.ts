/**
 * Express price computation single source of truth for quote + book.
 * Base Fee (₦20k Mechanic / ₦15k others) + call-out via the existing
 * road-route engine (₦350/km, short-distance discount, radius rules).
 */

import { expressBaseFeeMajor } from "@/lib/express/pricing";
import { findNearestExpressPro } from "@/lib/server/express/store";
import { computeApprovedRoadRoute } from "@/lib/server/routing/approved-route";
import { calculateCalloutFee } from "@/lib/callout/engine";
import { DEFAULT_CALLOUT_POLICY } from "@/lib/callout/constants";
import {
  calloutUrgencyMultiplier,
  isCalloutUrgencyKind,
} from "@/lib/callout/urgency";

export type ExpressQuote = {
  trade: string;
  baseMajor: number;
  baseChargeMajor: number;
  distanceKm: number | null;
  distanceChargeMajor: number;
  calloutMajor: number;
  urgency: string;
  urgencyMultiplier: number;
  urgencySurchargeMajor: number;
  totalMajor: number;
};

export async function computeExpressQuote(
  trade: string,
  lat: number,
  lng: number,
  urgency: string = "normal",
): Promise<ExpressQuote> {
  const kind = isCalloutUrgencyKind(urgency) ? urgency : "normal";
  const mult = calloutUrgencyMultiplier(kind);
  const baseMajor = expressBaseFeeMajor(trade);
  const nearest = await findNearestExpressPro({ trade, lat, lng });

  // Vulcanizer + Battery never charge a call-out (existing hard rule).
  if (!nearest || trade === "vulcanizer" || trade === "battery") {
    const scaled = Math.round(baseMajor * mult);
    return {
      trade,
      baseMajor,
      baseChargeMajor: baseMajor,
      distanceKm: null,
      distanceChargeMajor: 0,
      calloutMajor: 0,
      urgency: kind,
      urgencyMultiplier: mult,
      urgencySurchargeMajor: scaled - baseMajor,
      totalMajor: scaled,
    };
  }

  const route = await computeApprovedRoadRoute(
    { lat: nearest.lat, lng: nearest.lng },
    { lat, lng },
  );
  if (!route.ok || !Number.isFinite(route.route.distanceKm)) {
    // No live road route collect base now; call-out settles after lock.
    const scaled = Math.round(baseMajor * mult);
    return {
      trade,
      baseMajor,
      baseChargeMajor: baseMajor,
      distanceKm: null,
      distanceChargeMajor: 0,
      calloutMajor: 0,
      urgency: kind,
      urgencyMultiplier: mult,
      urgencySurchargeMajor: scaled - baseMajor,
      totalMajor: scaled,
    };
  }

  const distanceKm = Math.round(route.route.distanceKm * 100) / 100;
  const breakdown = calculateCalloutFee({
    tradeId: trade as Parameters<typeof calculateCalloutFee>[0]["tradeId"],
    approvedRouteDistanceKm: distanceKm,
    baseFee: baseMajor,
    policy: DEFAULT_CALLOUT_POLICY,
    urgencyMultiplier: mult,
  });
  return {
    trade,
    baseMajor,
    baseChargeMajor: breakdown.tradeBaseFee,
    distanceKm,
    distanceChargeMajor: breakdown.distanceCharge,
    calloutMajor: breakdown.distanceCharge,
    urgency: kind,
    urgencyMultiplier: mult,
    urgencySurchargeMajor:
      breakdown.calloutFee - (breakdown.tradeBaseFee + breakdown.distanceCharge),
    totalMajor: breakdown.calloutFee,
  };
}
