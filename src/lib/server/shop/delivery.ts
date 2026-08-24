/**
 * ONA Shop delivery engine (Phase 3).
 *
 * Modular, server-authoritative: the delivery fee is ALWAYS computed here,
 * never trusted from the client. Ona is the seller and delivers; a provider
 * abstraction keeps the door open for a licensed courier integration later.
 *
 * Providers:
 * - "ona_internal": Ona's own delivery operation (default, active now).
 * - Future: plug a courier provider into the registry without touching fees.
 */

import { createServiceSupabase } from "@/lib/supabase/server";

export type DeliveryZone = {
  code: string;
  name: string;
  surchargeMinor: number;
};

export type DeliveryService = {
  code: string;
  name: string;
  baseFeeMinor: number;
  etaMinutesMin: number;
  etaMinutesMax: number;
  freeAboveSubtotalMinor: number | null;
};

export type DeliveryEstimate = {
  deliveryFeeMinor: number;
  zoneCode: string;
  zoneName: string;
  serviceCode: string;
  serviceName: string;
  etaMinutesMin: number;
  etaMinutesMax: number;
  freeDelivery: boolean;
};

/**
 * Pure fee math (unit-testable): zone surcharge + service base, unless the
 * subtotal qualifies for free delivery.
 */
export function computeDeliveryFee(input: {
  service: Pick<DeliveryService, "baseFeeMinor" | "freeAboveSubtotalMinor">;
  zone: Pick<DeliveryZone, "surchargeMinor">;
  subtotalMinor: number;
}): { deliveryFeeMinor: number; freeDelivery: boolean } {
  if (
    input.service.freeAboveSubtotalMinor != null &&
    input.subtotalMinor >= input.service.freeAboveSubtotalMinor
  ) {
    return { deliveryFeeMinor: 0, freeDelivery: true };
  }
  return {
    deliveryFeeMinor: input.service.baseFeeMinor + input.zone.surchargeMinor,
    freeDelivery: false,
  };
}

/** Load the delivery zone a buyer chose for an address (falls back to default). */
export async function resolveDeliveryZone(opts: {
  addressId?: string | null;
  userId?: string;
  zoneCode?: string | null;
}): Promise<DeliveryZone> {
  const sb = createServiceSupabase();

  let code = opts.zoneCode || null;
  if (!code && opts.addressId && opts.userId) {
    const { data: addr } = await sb
      .from("user_addresses")
      .select("delivery_zone_code")
      .eq("id", opts.addressId)
      .eq("user_id", opts.userId)
      .maybeSingle();
    code = addr?.delivery_zone_code || null;
  }

  if (code) {
    const { data: zone } = await sb
      .from("shop_delivery_zones")
      .select("code, name, surcharge_minor")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();
    if (zone) {
      return {
        code: String(zone.code),
        name: String(zone.name),
        surchargeMinor: Number(zone.surcharge_minor),
      };
    }
  }

  // Default zone
  const { data: def } = await sb
    .from("shop_delivery_zones")
    .select("code, name, surcharge_minor")
    .eq("code", "default")
    .maybeSingle();
  if (def) {
    return {
      code: String(def.code),
      name: String(def.name),
      surchargeMinor: Number(def.surcharge_minor),
    };
  }
  return { code: "default", name: "Default", surchargeMinor: 0 };
}

/** Load the active delivery service (first by sort order). */
export async function getActiveDeliveryService(): Promise<DeliveryService> {
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("shop_delivery_services")
    .select(
      "code, name, base_fee_minor, eta_minutes_min, eta_minutes_max, free_above_subtotal_minor",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    code: String(data?.code ?? "ona_standard"),
    name: String(data?.name ?? "Ona Standard Delivery"),
    baseFeeMinor: Number(data?.base_fee_minor ?? 150000),
    etaMinutesMin: Number(data?.eta_minutes_min ?? 60),
    etaMinutesMax: Number(data?.eta_minutes_max ?? 180),
    freeAboveSubtotalMinor:
      data?.free_above_subtotal_minor != null
        ? Number(data.free_above_subtotal_minor)
        : null,
  };
}

/**
 * Server-authoritative delivery estimate for checkout.
 * Resolves zone (address/zoneCode → default), computes fee + ETA window.
 */
export async function estimateDelivery(opts: {
  addressId?: string | null;
  userId?: string;
  zoneCode?: string | null;
  subtotalMinor: number;
  serviceCode?: string | null;
}): Promise<DeliveryEstimate> {
  const zone = await resolveDeliveryZone(opts);
  const service = opts.serviceCode
    ? (await listDeliveryServices()).find((s) => s.code === opts.serviceCode) ||
      (await getActiveDeliveryService())
    : await getActiveDeliveryService();

  const { deliveryFeeMinor, freeDelivery } = computeDeliveryFee({
    service,
    zone,
    subtotalMinor: opts.subtotalMinor,
  });

  return {
    deliveryFeeMinor,
    zoneCode: zone.code,
    zoneName: zone.name,
    serviceCode: service.code,
    serviceName: service.name,
    etaMinutesMin: service.etaMinutesMin,
    etaMinutesMax: service.etaMinutesMax,
    freeDelivery,
  };
}

export async function listDeliveryZones(): Promise<DeliveryZone[]> {
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("shop_delivery_zones")
    .select("code, name, surcharge_minor")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((z) => ({
    code: String(z.code),
    name: String(z.name),
    surchargeMinor: Number(z.surcharge_minor),
  }));
}

export async function listDeliveryServices(): Promise<DeliveryService[]> {
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("shop_delivery_services")
    .select(
      "code, name, base_fee_minor, eta_minutes_min, eta_minutes_max, free_above_subtotal_minor",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((s) => ({
    code: String(s.code),
    name: String(s.name),
    baseFeeMinor: Number(s.base_fee_minor),
    etaMinutesMin: Number(s.eta_minutes_min),
    etaMinutesMax: Number(s.eta_minutes_max),
    freeAboveSubtotalMinor:
      s.free_above_subtotal_minor != null
        ? Number(s.free_above_subtotal_minor)
        : null,
  }));
}

// ---------------------------------------------------------------------------
// Provider abstraction Ona internal today, licensed courier later.
// ---------------------------------------------------------------------------

export type DeliveryCreateResult = {
  providerRef: string;
  trackingCode: string;
};

export interface DeliveryProvider {
  readonly code: string;
  /** Create the delivery operation after order is paid. */
  createDelivery(opts: {
    deliveryId: string;
    orderId: string;
    zoneCode: string;
    zoneName: string;
    etaMinutes: number;
  }): Promise<DeliveryCreateResult>;
  /** Poll a live tracking status from the provider (no-op for Ona internal). */
  track(opts: { providerRef: string }): Promise<{ status: string } | null>;
}

/** Ona's own delivery operation the active provider. */
export class OnaInternalDeliveryProvider implements DeliveryProvider {
  readonly code = "ona_internal";

  async createDelivery(opts: {
    deliveryId: string;
    orderId: string;
    zoneCode: string;
    zoneName: string;
    etaMinutes: number;
  }): Promise<DeliveryCreateResult> {
    const sb = createServiceSupabase();
    const trackingCode = `ONA-${opts.orderId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const etaAt = new Date(
      Date.now() + opts.etaMinutes * 60 * 1000,
    ).toISOString();
    await sb
      .from("shop_deliveries")
      .update({
        tracking_code: trackingCode,
        eta_at: etaAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.deliveryId);
    return { providerRef: opts.deliveryId, trackingCode };
  }

  async track(): Promise<{ status: string } | null> {
    // Ona internal: status lives in shop_deliveries, nothing external to poll.
    return null;
  }
}

export const DELIVERY_PROVIDERS: Record<string, DeliveryProvider> = {
  ona_internal: new OnaInternalDeliveryProvider(),
};
