/**
 * Persist / load Call-Out policy, trade fees, and per-request quotes.
 * Server-only (service role). Never trust client-submitted amounts.
 */

import {
  CALLOUT_POLICY_ID,
  DEFAULT_CALLOUT_POLICY,
  DEFAULT_TRADE_BASE_FEES,
  isCalloutStatus,
  type CalloutPolicy,
  type CalloutQuote,
  type CalloutStatus,
  type TradeCalloutPricing,
} from "@/lib/callout/constants";
import { writeAuditLog } from "@/lib/server/modules/audit";
import { writePlatformAudit } from "@/lib/server/modules/platform-audit";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { ALL_PRO_SERVICES, isProService } from "@/lib/services";
import type { ProService } from "@/lib/types";

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function rowToPolicy(row: Record<string, unknown> | null): CalloutPolicy {
  if (!row) return { ...DEFAULT_CALLOUT_POLICY };
  return {
    id: String(row.id || CALLOUT_POLICY_ID),
    enabled: row.enabled !== false,
    currency: String(row.currency || DEFAULT_CALLOUT_POLICY.currency),
    ratePerKm: num(row.rate_per_km, DEFAULT_CALLOUT_POLICY.ratePerKm),
    minimumBillableDistanceKm: num(
      row.minimum_billable_distance_km,
      DEFAULT_CALLOUT_POLICY.minimumBillableDistanceKm
    ),
    maximumRadiusKm: num(
      row.maximum_radius_km,
      DEFAULT_CALLOUT_POLICY.maximumRadiusKm
    ),
    billingIncrementKm: num(
      row.billing_increment_km,
      DEFAULT_CALLOUT_POLICY.billingIncrementKm
    ),
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function rowToTrade(row: Record<string, unknown>): TradeCalloutPricing | null {
  const id = String(row.trade_id || "");
  if (!isProService(id)) return null;
  return {
    tradeId: id,
    baseFee: num(row.base_fee, DEFAULT_TRADE_BASE_FEES[id]),
    currency: String(row.currency || "NGN"),
    enabled: row.enabled !== false,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export function rowToQuote(row: Record<string, unknown>): CalloutQuote {
  const statusRaw = String(row.callout_status || "PENDING");
  const tradeRaw = row.trade_id ? String(row.trade_id) : null;
  return {
    requestId: String(row.request_id),
    calloutEligible: row.callout_eligible === true,
    calloutStatus: isCalloutStatus(statusRaw) ? statusRaw : "PENDING",
    tradeId: tradeRaw && isProService(tradeRaw) ? tradeRaw : null,
    tradeBaseFee: row.trade_base_fee != null ? Number(row.trade_base_fee) : null,
    distanceRate: row.distance_rate != null ? Number(row.distance_rate) : null,
    approvedRouteDistanceKm:
      row.approved_route_distance_km != null
        ? Number(row.approved_route_distance_km)
        : null,
    billableDistanceKm:
      row.billable_distance_km != null ? Number(row.billable_distance_km) : null,
    distanceCharge:
      row.distance_charge != null ? Number(row.distance_charge) : null,
    calloutFee: row.callout_fee != null ? Number(row.callout_fee) : null,
    currency: String(row.currency || "NGN"),
    originLatitude:
      row.origin_latitude != null ? Number(row.origin_latitude) : null,
    originLongitude:
      row.origin_longitude != null ? Number(row.origin_longitude) : null,
    destinationLatitude:
      row.destination_latitude != null ? Number(row.destination_latitude) : null,
    destinationLongitude:
      row.destination_longitude != null
        ? Number(row.destination_longitude)
        : null,
    routeSource: row.route_source ? String(row.route_source) : null,
    calculatedAt: row.calculated_at ? String(row.calculated_at) : null,
    lockedAt: row.locked_at ? String(row.locked_at) : null,
    originAccuracyM:
      row.origin_accuracy_m != null ? Number(row.origin_accuracy_m) : null,
    originCapturedAt: row.origin_captured_at
      ? String(row.origin_captured_at)
      : null,
    originProId: row.origin_pro_id ? String(row.origin_pro_id) : null,
    lockIdempotencyKey: row.lock_idempotency_key
      ? String(row.lock_idempotency_key)
      : null,
    voidedAt: row.voided_at ? String(row.voided_at) : null,
    voidReason: row.void_reason ? String(row.void_reason) : null,
    travelPhase: row.travel_phase ? String(row.travel_phase) : null,
    billedFromDrivenKm: row.billed_from_driven_km === true,
  };
}

export async function loadCalloutPolicy(): Promise<CalloutPolicy> {
  if (!isSupabaseAdminConfigured()) return { ...DEFAULT_CALLOUT_POLICY };
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("call_out_policies")
      .select("*")
      .eq("id", CALLOUT_POLICY_ID)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_CALLOUT_POLICY };
    return rowToPolicy(data as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_CALLOUT_POLICY };
  }
}

export async function loadTradeCalloutPricing(): Promise<TradeCalloutPricing[]> {
  const seeded: TradeCalloutPricing[] = ALL_PRO_SERVICES.map((tradeId) => ({
    tradeId,
    baseFee: DEFAULT_TRADE_BASE_FEES[tradeId],
    currency: "NGN",
    enabled: true,
    updatedBy: null,
    updatedAt: null,
  }));
  if (!isSupabaseAdminConfigured()) return seeded;
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("trade_call_out_pricing")
      .select("*");
    if (error || !data) return seeded;
    const byId = new Map<ProService, TradeCalloutPricing>();
    for (const row of data as Record<string, unknown>[]) {
      const t = rowToTrade(row);
      if (t) byId.set(t.tradeId, t);
    }
    return seeded.map((s) => byId.get(s.tradeId) ?? s);
  } catch {
    return seeded;
  }
}

export async function loadTradeBaseFee(
  tradeId: ProService
): Promise<{ baseFee: number; enabled: boolean }> {
  const all = await loadTradeCalloutPricing();
  const hit = all.find((t) => t.tradeId === tradeId);
  return {
    baseFee: hit?.baseFee ?? DEFAULT_TRADE_BASE_FEES[tradeId],
    enabled: hit ? hit.enabled : true,
  };
}

export async function getCalloutQuote(
  requestId: string
): Promise<CalloutQuote | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("service_request_callouts")
      .select("*")
      .eq("request_id", requestId)
      .maybeSingle();
    if (error || !data) return null;
    return rowToQuote(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function upsertCalloutQuote(
  quote: CalloutQuote
): Promise<CalloutQuote | null> {
  if (!isSupabaseAdminConfigured()) return quote;
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("service_request_callouts")
      .upsert(
        {
          request_id: quote.requestId,
          callout_eligible: quote.calloutEligible,
          callout_status: quote.calloutStatus,
          trade_id: quote.tradeId,
          trade_base_fee: quote.tradeBaseFee,
          distance_rate: quote.distanceRate,
          approved_route_distance_km: quote.approvedRouteDistanceKm,
          billable_distance_km: quote.billableDistanceKm,
          distance_charge: quote.distanceCharge,
          callout_fee: quote.calloutFee,
          currency: quote.currency,
          origin_latitude: quote.originLatitude,
          origin_longitude: quote.originLongitude,
          destination_latitude: quote.destinationLatitude,
          destination_longitude: quote.destinationLongitude,
          route_source: quote.routeSource,
          calculated_at: quote.calculatedAt,
          locked_at: quote.lockedAt,
          origin_accuracy_m: quote.originAccuracyM ?? null,
          origin_captured_at: quote.originCapturedAt ?? null,
          origin_pro_id: quote.originProId ?? null,
          lock_idempotency_key: quote.lockIdempotencyKey ?? null,
          voided_at: quote.voidedAt ?? null,
          void_reason: quote.voidReason ?? null,
          travel_phase: quote.travelPhase ?? "before_travel",
          billed_from_driven_km: quote.billedFromDrivenKm === true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "request_id" }
      )
      .select("*")
      .single();
    if (error || !data) return quote;
    return rowToQuote(data as Record<string, unknown>);
  } catch {
    return quote;
  }
}

export async function updateCalloutStatus(
  requestId: string,
  status: CalloutStatus
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  try {
    const sb = createServiceSupabase();
    const patch: Record<string, unknown> = {
      callout_status: status,
      updated_at: new Date().toISOString(),
    };
    if (status === "LOCKED") patch.locked_at = new Date().toISOString();
    await sb
      .from("service_request_callouts")
      .update(patch)
      .eq("request_id", requestId);
  } catch {
    /* table may not exist yet */
  }
}

type PolicyPatch = Partial<
  Pick<
    CalloutPolicy,
    | "enabled"
    | "currency"
    | "ratePerKm"
    | "minimumBillableDistanceKm"
    | "maximumRadiusKm"
    | "billingIncrementKm"
  >
>;

async function writeFieldAudit(input: {
  adminId: string;
  targetType: string;
  targetId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string;
}) {
  if (Object.is(input.oldValue, input.newValue)) return;
  try {
    const sb = createServiceSupabase();
    await sb.from("call_out_policy_audit").insert({
      admin_id: input.adminId,
      target_type: input.targetType,
      target_id: input.targetId,
      field_changed: input.field,
      old_value: input.oldValue,
      new_value: input.newValue,
      reason: input.reason ?? null,
    });
  } catch {
    /* optional */
  }
  await writePlatformAudit({
    actorId: input.adminId,
    actorRole: "admin",
    action: "callout.policy_change",
    targetType: input.targetType,
    targetId: input.targetId,
    oldValue: { [input.field]: input.oldValue },
    newValue: { [input.field]: input.newValue },
    meta: { reason: input.reason ?? null },
  });
  await writeAuditLog({
    adminId: input.adminId,
    action: "callout.policy_change",
    meta: {
      targetType: input.targetType,
      targetId: input.targetId,
      field: input.field,
      oldValue: input.oldValue,
      newValue: input.newValue,
      reason: input.reason ?? null,
    },
  });
}

export async function saveCalloutPolicy(
  patch: PolicyPatch,
  adminId: string,
  reason?: string
): Promise<CalloutPolicy> {
  const current = await loadCalloutPolicy();
  const next: CalloutPolicy = {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    currency: patch.currency ?? current.currency,
    ratePerKm:
      patch.ratePerKm != null && patch.ratePerKm > 0
        ? patch.ratePerKm
        : current.ratePerKm,
    minimumBillableDistanceKm:
      patch.minimumBillableDistanceKm != null &&
      patch.minimumBillableDistanceKm >= 0
        ? patch.minimumBillableDistanceKm
        : current.minimumBillableDistanceKm,
    maximumRadiusKm:
      patch.maximumRadiusKm != null && patch.maximumRadiusKm > 0
        ? patch.maximumRadiusKm
        : current.maximumRadiusKm,
    billingIncrementKm:
      patch.billingIncrementKm != null && patch.billingIncrementKm > 0
        ? patch.billingIncrementKm
        : current.billingIncrementKm,
    updatedBy: adminId,
    updatedAt: new Date().toISOString(),
  };

  const fields: Array<keyof PolicyPatch> = [
    "enabled",
    "currency",
    "ratePerKm",
    "minimumBillableDistanceKm",
    "maximumRadiusKm",
    "billingIncrementKm",
  ];
  for (const field of fields) {
    await writeFieldAudit({
      adminId,
      targetType: "call_out_policy",
      targetId: CALLOUT_POLICY_ID,
      field,
      oldValue: current[field],
      newValue: next[field],
      reason,
    });
  }

  if (!isSupabaseAdminConfigured()) return next;
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("call_out_policies")
    .upsert({
      id: CALLOUT_POLICY_ID,
      enabled: next.enabled,
      currency: next.currency,
      rate_per_km: next.ratePerKm,
      minimum_billable_distance_km: next.minimumBillableDistanceKm,
      maximum_radius_km: next.maximumRadiusKm,
      billing_increment_km: next.billingIncrementKm,
      updated_by: adminId,
      updated_at: next.updatedAt,
    })
    .select("*")
    .single();
  if (error || !data) return next;
  return rowToPolicy(data as Record<string, unknown>);
}

export async function saveTradeCalloutPricing(
  tradeId: ProService,
  patch: { baseFee?: number; enabled?: boolean; currency?: string },
  adminId: string,
  reason?: string
): Promise<TradeCalloutPricing> {
  const all = await loadTradeCalloutPricing();
  const current = all.find((t) => t.tradeId === tradeId) ?? {
    tradeId,
    baseFee: DEFAULT_TRADE_BASE_FEES[tradeId],
    currency: "NGN",
    enabled: true,
    updatedBy: null,
    updatedAt: null,
  };
  const next: TradeCalloutPricing = {
    ...current,
    baseFee:
      patch.baseFee != null && patch.baseFee >= 0
        ? patch.baseFee
        : current.baseFee,
    enabled: patch.enabled ?? current.enabled,
    currency: patch.currency ?? current.currency,
    updatedBy: adminId,
    updatedAt: new Date().toISOString(),
  };

  for (const field of ["baseFee", "enabled", "currency"] as const) {
    await writeFieldAudit({
      adminId,
      targetType: "trade_call_out_pricing",
      targetId: tradeId,
      field,
      oldValue: current[field],
      newValue: next[field],
      reason,
    });
  }

  if (!isSupabaseAdminConfigured()) return next;
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("trade_call_out_pricing")
    .upsert({
      trade_id: tradeId,
      base_fee: next.baseFee,
      currency: next.currency,
      enabled: next.enabled,
      updated_by: adminId,
      updated_at: next.updatedAt,
    })
    .select("*")
    .single();
  if (error || !data) return next;
  return rowToTrade(data as Record<string, unknown>) ?? next;
}
