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
  /** Customer satisfied; pro 87.5% waiting for FLW Available settlement */
  | "pending_settlement"
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

/**
 * Supersede every live-but-unpaid payment intent for a request so only the
 * newest pending session stays actionable. A new charge always supersedes old
 * drafts (double-submit / pay-again bursts). Never touches money rows
 * (held / releasing / released / refunded / paid). Idempotent — safe to call
 * before every insert. Returns how many rows were superseded.
 */
export async function supersedePendingPaymentsForRequest(
  requestId: string,
  supersededBy?: string | null,
  reason = "superseded_by_new_payment"
): Promise<number> {
  if (!isSupabaseAdminConfigured()) return 0;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("payments")
      .select("*")
      .eq("request_id", requestId)
      .or("escrow_status.eq.pending_payment,status.eq.pending");
    const rows = (data ?? []) as Record<string, unknown>[];
    let n = 0;
    const ts = nowIso();
    for (const row of rows) {
      const esc = String(row.escrow_status || "");
      if (
        row.paid_at ||
        row.released_at ||
        row.refunded_at ||
        ["held", "release_pending", "pending_settlement", "released", "refunded"].includes(esc)
      ) {
        continue;
      }
      const prevMeta = (row.meta as Record<string, unknown>) || {};
      if (esc === "failed" && String(row.status) === "failed" && prevMeta.superseded === true) {
        continue;
      }
      await sb
        .from("payments")
        .update({
          status: "failed",
          escrow_status: "failed",
          meta: {
            ...prevMeta,
            superseded: true,
            supersededBy: supersededBy || null,
            supersededAt: ts,
            expiredAt: ts,
            expiredReason: reason,
          },
          updated_at: ts,
        })
        .eq("id", String(row.id));
      n += 1;
    }
    return n;
  } catch (e) {
    console.error("supersedePendingPaymentsForRequest", requestId, e);
    return 0;
  }
}

/**
 * Admin-facing self-heal: mark unpaid draft charges whose payment session has
 * closed as superseded so the Control Center never shows a stuck
 * "Awaiting payment" for an abandoned bank-transfer VA. Skips anything funded.
 * A grace period past the session end gives a delayed webhook time to mark a
 * funded charge held before we expire it.
 */
export async function expireStalePendingPayments(
  now: Date = new Date()
): Promise<number> {
  if (!isSupabaseAdminConfigured()) return 0;
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("payments")
      .select("id, request_id, meta, created_at")
      .or("escrow_status.eq.pending_payment,status.eq.pending");
    if (error) return 0;
    const rows = (data ?? []) as Record<string, unknown>[];
    const nowMs = now.getTime();
    // Funded charges flip to held within minutes; 10 min past the session end
    // is a safe window before we treat the VA as abandoned.
    const sessionGraceMs = 10 * 60 * 1000;
    // Rows recorded before meta carried a session end: expire once old enough
    // that any real bank transfer would have settled or the VA expired.
    const noSessionFallbackMs = 45 * 60 * 1000;
    const stale = new Set<string>();
    for (const row of rows) {
      if (String(row.escrow_status || "") !== "pending_payment") continue;
      const meta = (row.meta as Record<string, unknown>) || {};
      const sessionEnds = String(meta.paymentSessionEndsAt || "");
      const createdMs = Date.parse(String(row.created_at || "")) || 0;
      let expiredMs = 0;
      if (sessionEnds) {
        expiredMs = Date.parse(sessionEnds) + sessionGraceMs;
      } else if (createdMs) {
        expiredMs = createdMs + noSessionFallbackMs;
      }
      if (expiredMs && nowMs > expiredMs) {
        stale.add(String(row.request_id || row.id || ""));
      }
    }
    let n = 0;
    for (const requestId of stale) {
      n += await supersedePendingPaymentsForRequest(
        requestId,
        null,
        "payment_window_expired_admin"
      );
    }
    return n;
  } catch (e) {
    console.error("expireStalePendingPayments", e);
    return 0;
  }
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
      // A fresh intent supersedes any older unpaid drafts (race-safe: even
      // concurrent double-submits converge — last writer wins).
      await supersedePendingPaymentsForRequest(
        input.requestId,
        input.providerRef
      );
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
  const raw = (reference || "").trim();
  if (!raw) return null;
  // Flutterwave may return tx_ref variants (suffixes, case)
  const candidates = Array.from(
    new Set([
      raw,
      raw.replace(/_m$/i, ""),
      decodeURIComponent(raw),
    ])
  );

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      for (const ref of candidates) {
        const { data } = await sb
          .from("payments")
          .select("*")
          .eq("provider_ref", ref)
          .maybeSingle();
        if (data) return rowToEscrow(data as Record<string, unknown>);
      }
      // Prefix match for truncated / mutated refs
      if (raw.length >= 12) {
        const { data: list } = await sb
          .from("payments")
          .select("*")
          .ilike("provider_ref", `${raw.slice(0, 20)}%`)
          .order("created_at", { ascending: false })
          .limit(3);
        if (list?.[0]) return rowToEscrow(list[0] as Record<string, unknown>);
      }
    } catch {
      /* memory */
    }
  }
  for (const ref of candidates) {
    const hit = memory.get(`ref:${ref}`);
    if (hit) return hit;
  }
  return null;
}

export async function getEscrowByRequest(
  requestId: string
): Promise<EscrowPayment | null> {
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      // Prefer money rows (ignore expired Pay-again drafts)
      const { data: held } = await sb
        .from("payments")
        .select("*")
        .eq("request_id", requestId)
        .in("escrow_status", [
          "held",
          "release_pending",
          "pending_settlement",
          "released",
        ])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (held) return rowToEscrow(held as Record<string, unknown>);

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
  let best: EscrowPayment | null = null;
  for (const p of memory.values()) {
    if (p.requestId !== requestId || p.id.startsWith("ref:")) continue;
    if (
      p.escrowStatus === "held" ||
      p.escrowStatus === "release_pending" ||
      p.escrowStatus === "pending_settlement" ||
      p.escrowStatus === "released"
    ) {
      return p;
    }
    if (!best) best = p;
  }
  return best;
}

/** List escrow rows by status (admin + retry queue). */
export async function listEscrowsByStatuses(
  statuses: EscrowStatus[],
  limit = 100
): Promise<EscrowPayment[]> {
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data, error } = await sb
        .from("payments")
        .select("*")
        .in("escrow_status", statuses)
        .order("updated_at", { ascending: false })
        .limit(limit);
      // Empty array is a successful answer — do not fall through to memory
      if (!error && data != null) {
        return data.map((r) => rowToEscrow(r as Record<string, unknown>));
      }
    } catch {
      /* memory */
    }
  }
  const out: EscrowPayment[] = [];
  for (const p of memory.values()) {
    if (p.id.startsWith("ref:")) continue;
    if (statuses.includes(p.escrowStatus)) out.push(p);
  }
  return out.slice(0, limit);
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
    platformFeeMinor: number;
    proPayoutMinor: number;
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
  if (patch.platformFeeMinor != null)
    dbPatch.platform_fee_kobo = patch.platformFeeMinor;
  if (patch.proPayoutMinor != null)
    dbPatch.pro_payout_kobo = patch.proPayoutMinor;
  if (patch.meta) dbPatch.meta = patch.meta;

  const moneyTouch =
    patch.status != null ||
    patch.escrowStatus != null ||
    patch.paidAt !== undefined ||
    patch.releasedAt !== undefined ||
    patch.refundedAt !== undefined;

  let result: EscrowPayment | null = null;

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("payments")
        .update(dbPatch)
        .eq("id", id)
        .select("*")
        .single();
      if (data) result = rowToEscrow(data as Record<string, unknown>);
    } catch {
      /* memory */
    }
  }

  if (!result) {
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
      platformFeeMinor: patch.platformFeeMinor ?? existing.platformFeeMinor,
      proPayoutMinor: patch.proPayoutMinor ?? existing.proPayoutMinor,
      meta: patch.meta ?? existing.meta,
      updatedAt: nowIso(),
    };
    memory.set(id, next);
    if (next.providerRef) memory.set(`ref:${next.providerRef}`, next);
    result = next;
  }

  // Local BackUp snapshot after money-relevant escrow changes (debounced)
  if (result && moneyTouch) {
    try {
      const { triggerBackupAfterPaymentChange, isMoneyEscrowStatus } =
        await import("@/lib/server/local-backup-trigger");
      if (isMoneyEscrowStatus(result.status, result.escrowStatus)) {
        triggerBackupAfterPaymentChange(
          `payment_${result.escrowStatus || result.status}`
        );
      }
    } catch {
      /* never block payments on backup */
    }
  }

  return result;
}

/** One history row per request — prefer the payment row that matters most.
 *  Multiple attempt rows (failed drafts, re-inits) for the same request must
 *  NOT show as separate entries (a single job is one open payment, never two). */
export function preferPaymentRow(rows: EscrowPayment[]): EscrowPayment[] {
  const rank: Record<string, number> = {
    released: 6,
    pending_settlement: 5,
    release_pending: 4,
    held: 3,
    pending_payment: 2,
    refunded: 1,
    failed: 0,
  };
  const best = new Map<string, EscrowPayment>();
  for (const p of rows) {
    const cur = best.get(p.requestId);
    const pr = rank[p.escrowStatus] ?? -1;
    if (!cur || (rank[cur.escrowStatus] ?? -1) < pr) {
      best.set(p.requestId, p);
    }
  }
  return [...best.values()].sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || "")
  );
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
        return preferPaymentRow(
          (data as Record<string, unknown>[]).map(rowToEscrow)
        );
      }
    } catch {
      /* memory */
    }
  }
  return preferPaymentRow(
    [...memory.values()].filter(
      (p) =>
        !String(p.id).startsWith("ref:") &&
        (p.motoristId === userId || p.repairProId === userId)
    )
  );
}
