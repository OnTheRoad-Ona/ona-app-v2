/**
 * Server-side escrow payment records (Supabase when available, memory fallback).
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import type { AppCurrency } from "@/lib/pricing";
import type { PaymentProviderId } from "@/lib/server/payments/providers";

export type EscrowStatus =
  | "none"
  | "pending_payment"
  | "held"
  | "release_pending"
  | "released"
  | "refunded"
  | "failed";

export type EscrowPayment = {
  id: string;
  requestId: string;
  motoristId: string;
  repairProId: string | null;
  amountMinor: number;
  baseAmountMinor: number;
  discountPercent: number;
  platformFeeMinor: number;
  proPayoutMinor: number;
  currency: AppCurrency;
  status: string;
  escrowStatus: EscrowStatus;
  provider: PaymentProviderId | string;
  providerRef: string | null;
  providerChannel: string | null;
  serviceType: string | null;
  labourOnly: boolean;
  paidAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  motoristCompletedAt: string | null;
  proCompletedAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const memory = new Map<string, EscrowPayment>();

function nowIso() {
  return new Date().toISOString();
}

function rowToEscrow(row: Record<string, unknown>): EscrowPayment {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    motoristId: String(row.motorist_id),
    repairProId: row.repair_pro_id ? String(row.repair_pro_id) : null,
    amountMinor: Number(row.amount_kobo) || 0,
    baseAmountMinor: Number(row.base_amount_kobo ?? row.amount_kobo) || 0,
    discountPercent: Number(row.discount_percent) || 0,
    platformFeeMinor: Number(row.platform_fee_kobo) || 0,
    proPayoutMinor: Number(row.pro_payout_kobo) || 0,
    currency: (row.currency as AppCurrency) || "NGN",
    status: String(row.status || "pending"),
    escrowStatus: (row.escrow_status as EscrowStatus) || "none",
    provider: String(row.provider || "manual"),
    providerRef: row.provider_ref ? String(row.provider_ref) : null,
    providerChannel: row.provider_channel ? String(row.provider_channel) : null,
    serviceType: row.service_type ? String(row.service_type) : null,
    labourOnly: row.labour_only !== false,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    releasedAt: row.released_at ? String(row.released_at) : null,
    refundedAt: row.refunded_at ? String(row.refunded_at) : null,
    motoristCompletedAt: row.motorist_completed_at
      ? String(row.motorist_completed_at)
      : null,
    proCompletedAt: row.pro_completed_at ? String(row.pro_completed_at) : null,
    meta: (row.meta as Record<string, unknown>) || {},
    createdAt: String(row.created_at || nowIso()),
    updatedAt: String(row.updated_at || nowIso()),
  };
}

export async function createEscrowPayment(input: {
  requestId: string;
  motoristId: string;
  repairProId: string;
  amountMinor: number;
  baseAmountMinor: number;
  discountPercent: number;
  platformFeeMinor: number;
  proPayoutMinor: number;
  currency: AppCurrency;
  provider: string;
  providerRef: string;
  serviceType: string;
  meta?: Record<string, unknown>;
}): Promise<EscrowPayment> {
  const ts = nowIso();
  const payload = {
    request_id: input.requestId,
    motorist_id: input.motoristId,
    repair_pro_id: input.repairProId,
    amount_kobo: input.amountMinor,
    base_amount_kobo: input.baseAmountMinor,
    discount_percent: input.discountPercent,
    platform_fee_kobo: input.platformFeeMinor,
    pro_payout_kobo: input.proPayoutMinor,
    currency: input.currency,
    status: "pending",
    escrow_status: "pending_payment",
    provider: input.provider,
    provider_ref: input.providerRef,
    service_type: input.serviceType,
    labour_only: true,
    meta: input.meta || {},
    created_at: ts,
    updated_at: ts,
  };

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data, error } = await sb
        .from("payments")
        .insert(payload)
        .select("*")
        .single();
      if (!error && data) return rowToEscrow(data as Record<string, unknown>);
    } catch {
      /* fall through to memory */
    }
  }

  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mem: EscrowPayment = {
    id,
    requestId: input.requestId,
    motoristId: input.motoristId,
    repairProId: input.repairProId,
    amountMinor: input.amountMinor,
    baseAmountMinor: input.baseAmountMinor,
    discountPercent: input.discountPercent,
    platformFeeMinor: input.platformFeeMinor,
    proPayoutMinor: input.proPayoutMinor,
    currency: input.currency,
    status: "pending",
    escrowStatus: "pending_payment",
    provider: input.provider,
    providerRef: input.providerRef,
    providerChannel: null,
    serviceType: input.serviceType,
    labourOnly: true,
    paidAt: null,
    releasedAt: null,
    refundedAt: null,
    motoristCompletedAt: null,
    proCompletedAt: null,
    meta: input.meta || {},
    createdAt: ts,
    updatedAt: ts,
  };
  memory.set(id, mem);
  memory.set(`ref:${input.providerRef}`, mem);
  return mem;
}

export async function getEscrowByRef(
  reference: string
): Promise<EscrowPayment | null> {
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("payments")
        .select("*")
        .eq("provider_ref", reference)
        .maybeSingle();
      if (data) return rowToEscrow(data as Record<string, unknown>);
    } catch {
      /* memory */
    }
  }
  return memory.get(`ref:${reference}`) || null;
}

export async function getEscrowByRequest(
  requestId: string
): Promise<EscrowPayment | null> {
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("payments")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return rowToEscrow(data as Record<string, unknown>);
    } catch {
      /* memory */
    }
  }
  for (const p of memory.values()) {
    if (p.requestId === requestId && !p.id.startsWith("ref:")) return p;
  }
  return null;
}

export async function updateEscrow(
  id: string,
  patch: Partial<{
    status: string;
    escrowStatus: EscrowStatus;
    paidAt: string | null;
    releasedAt: string | null;
    refundedAt: string | null;
    motoristCompletedAt: string | null;
    proCompletedAt: string | null;
    providerChannel: string | null;
    amountMinor: number;
    meta: Record<string, unknown>;
  }>
): Promise<EscrowPayment | null> {
  const dbPatch: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.status != null) dbPatch.status = patch.status;
  if (patch.escrowStatus != null) dbPatch.escrow_status = patch.escrowStatus;
  if (patch.paidAt !== undefined) dbPatch.paid_at = patch.paidAt;
  if (patch.releasedAt !== undefined) dbPatch.released_at = patch.releasedAt;
  if (patch.refundedAt !== undefined) dbPatch.refunded_at = patch.refundedAt;
  if (patch.motoristCompletedAt !== undefined)
    dbPatch.motorist_completed_at = patch.motoristCompletedAt;
  if (patch.proCompletedAt !== undefined)
    dbPatch.pro_completed_at = patch.proCompletedAt;
  if (patch.providerChannel !== undefined)
    dbPatch.provider_channel = patch.providerChannel;
  if (patch.amountMinor != null) dbPatch.amount_kobo = patch.amountMinor;
  if (patch.meta) dbPatch.meta = patch.meta;

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("payments")
        .update(dbPatch)
        .eq("id", id)
        .select("*")
        .single();
      if (data) return rowToEscrow(data as Record<string, unknown>);
    } catch {
      /* memory */
    }
  }

  const existing = memory.get(id);
  if (!existing) return null;
  const next: EscrowPayment = {
    ...existing,
    status: patch.status ?? existing.status,
    escrowStatus: patch.escrowStatus ?? existing.escrowStatus,
    paidAt: patch.paidAt !== undefined ? patch.paidAt : existing.paidAt,
    releasedAt:
      patch.releasedAt !== undefined ? patch.releasedAt : existing.releasedAt,
    refundedAt:
      patch.refundedAt !== undefined ? patch.refundedAt : existing.refundedAt,
    motoristCompletedAt:
      patch.motoristCompletedAt !== undefined
        ? patch.motoristCompletedAt
        : existing.motoristCompletedAt,
    proCompletedAt:
      patch.proCompletedAt !== undefined
        ? patch.proCompletedAt
        : existing.proCompletedAt,
    providerChannel:
      patch.providerChannel !== undefined
        ? patch.providerChannel
        : existing.providerChannel,
    amountMinor: patch.amountMinor ?? existing.amountMinor,
    meta: patch.meta ?? existing.meta,
    updatedAt: nowIso(),
  };
  memory.set(id, next);
  if (next.providerRef) memory.set(`ref:${next.providerRef}`, next);
  return next;
}

export async function listEscrowForUser(
  userId: string
): Promise<EscrowPayment[]> {
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("payments")
        .select("*")
        .or(`motorist_id.eq.${userId},repair_pro_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) {
        return (data as Record<string, unknown>[]).map(rowToEscrow);
      }
    } catch {
      /* memory */
    }
  }
  return [...memory.values()]
    .filter(
      (p) =>
        !String(p.id).startsWith("ref:") &&
        (p.motoristId === userId || p.repairProId === userId)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
