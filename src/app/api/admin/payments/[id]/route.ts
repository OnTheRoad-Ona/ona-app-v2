/**
 * Admin payment detail Ona escrow + Flutterwave transfers for one payment/job.
 */

import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  listLedgerByPayment,
  listLedgerByRequest,
} from "@/lib/server/payments/payout-ledger";
import { findExistingFlutterwaveTransfer } from "@/lib/server/payments/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listFlwTransfersForRef(reference: string) {
  const secret = (process.env.FLUTTERWAVE_SECRET_KEY || "").trim();
  if (!secret || !reference) return [];
  try {
    const res = await fetch(
      `https://api.flutterwave.com/v3/transfers?reference=${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    );
    const json = (await res.json()) as {
      status?: string;
      data?: unknown;
    };
    if (json.status !== "success" || json.data == null) return [];
    const rows = Array.isArray(json.data) ? json.data : [json.data];
    return rows.map((t) => {
      const row = t as Record<string, unknown>;
      return {
        id: row.id != null ? String(row.id) : null,
        reference: row.reference != null ? String(row.reference) : null,
        amount: row.amount != null ? Number(row.amount) : null,
        currency: row.currency != null ? String(row.currency) : "NGN",
        status: row.status != null ? String(row.status) : null,
        narration: row.narration != null ? String(row.narration) : null,
        complete_message:
          row.complete_message != null ? String(row.complete_message) : null,
        created_at: row.created_at != null ? String(row.created_at) : null,
        account_number:
          row.account_number != null
            ? `****${String(row.account_number).slice(-4)}`
            : null,
        bank_name: row.bank_name != null ? String(row.bank_name) : null,
        fee: row.fee != null ? Number(row.fee) : null,
      };
    });
  } catch {
    return [];
  }
}

/** Also pull recent transfers that mention this job id in narration (diagnostics) */
async function listRecentFlwTransfersMentioning(jobIdShort: string) {
  const secret = (process.env.FLUTTERWAVE_SECRET_KEY || "").trim();
  if (!secret) return [];
  try {
    const res = await fetch("https://api.flutterwave.com/v3/transfers?page=1", {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as { data?: unknown };
    let rows = json.data;
    if (rows && typeof rows === "object" && !Array.isArray(rows)) {
      rows = (rows as { transfers?: unknown }).transfers;
    }
    if (!Array.isArray(rows)) return [];
    const needle = jobIdShort.toLowerCase();
    return rows
      .filter((t) => {
        const row = t as Record<string, unknown>;
        const ref = String(row.reference || "").toLowerCase();
        const narr = String(row.narration || "").toLowerCase();
        return (
          ref.includes(needle) || narr.includes(needle) || narr.includes("ona")
        );
      })
      .slice(0, 30)
      .map((t) => {
        const row = t as Record<string, unknown>;
        return {
          id: row.id != null ? String(row.id) : null,
          reference: row.reference != null ? String(row.reference) : null,
          amount: row.amount != null ? Number(row.amount) : null,
          currency: row.currency != null ? String(row.currency) : "NGN",
          status: row.status != null ? String(row.status) : null,
          narration: row.narration != null ? String(row.narration) : null,
          complete_message:
            row.complete_message != null ? String(row.complete_message) : null,
          created_at: row.created_at != null ? String(row.created_at) : null,
          account_number:
            row.account_number != null
              ? `****${String(row.account_number).slice(-4)}`
              : null,
          bank_name: row.bank_name != null ? String(row.bank_name) : null,
          fee: row.fee != null ? Number(row.fee) : null,
        };
      });
  } catch {
    return [];
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requirePermission("view_payment_full");
    const { id } = await ctx.params;
    const sb = createServiceSupabase();

    // id may be payment uuid or request/job uuid
    let payment: Record<string, unknown> | null = null;
    const byId = await sb
      .from("payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (byId.data) payment = byId.data as Record<string, unknown>;
    if (!payment) {
      const byReq = await sb
        .from("payments")
        .select("*")
        .eq("request_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byReq.data) payment = byReq.data as Record<string, unknown>;
    }
    if (!payment) return apiFail("Payment not found", 404);

    const paymentId = String(payment.id);
    const requestId = payment.request_id ? String(payment.request_id) : null;
    const meta = (payment.meta as Record<string, unknown>) || {};
    const idemRef = String(
      meta.idempotentTransferRef || meta.proTransferRef || "",
    ).trim();

    const [ledgerByPay, ledgerByReq, flwByRef, job] = await Promise.all([
      listLedgerByPayment(paymentId),
      requestId ? listLedgerByRequest(requestId) : Promise.resolve([]),
      idemRef ? listFlwTransfersForRef(idemRef) : Promise.resolve([]),
      requestId
        ? sb
            .from("service_requests")
            .select(
              "id, status, flow_status, escrow_status, agreed_major, amount_minor, pro_payout_minor, platform_fee_minor, released_at, satisfied_at, repair_pro_id, motorist_id, motorist_name, repair_pro_name, service_type, updated_at",
            )
            .eq("id", requestId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const jobRow = (job.data || null) as Record<string, unknown> | null;
    const motoristId = jobRow?.motorist_id
      ? String(jobRow.motorist_id)
      : payment.motorist_id
        ? String(payment.motorist_id)
        : null;
    const proId = jobRow?.repair_pro_id
      ? String(jobRow.repair_pro_id)
      : payment.repair_pro_id
        ? String(payment.repair_pro_id)
        : null;

    const [motoristProf, proProf] = await Promise.all([
      motoristId
        ? sb
            .from("profiles")
            .select("id, full_name, phone, email")
            .eq("id", motoristId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      proId
        ? sb
            .from("profiles")
            .select("id, full_name, phone, email")
            .eq("id", proId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const proBank = proId
      ? await sb
          .from("repair_pro_profiles")
          .select(
            "bank_code, bank_name, bank_account_number, bank_account_name",
          )
          .eq("user_id", proId)
          .maybeSingle()
      : { data: null };

    // Merge ledger lists unique by transfer_ref
    const ledgerMap = new Map<string, (typeof ledgerByPay)[0]>();
    for (const row of [...ledgerByPay, ...ledgerByReq]) {
      ledgerMap.set(row.transferRef, row);
    }

    // Extra FLW page-1 scan for job short id (catches accidental diag refs)
    const short = requestId ? requestId.replace(/-/g, "").slice(0, 8) : "";
    const flwRecent = short
      ? await listRecentFlwTransfersMentioning(short)
      : [];

    // Dedupe FLW rows by id/reference
    const flwMap = new Map<string, (typeof flwByRef)[0]>();
    for (const t of [...flwByRef, ...flwRecent]) {
      const k = String(t.id || t.reference || Math.random());
      flwMap.set(k, t);
    }

    const existingCheck = idemRef
      ? await findExistingFlutterwaveTransfer(idemRef)
      : { found: false as const };

    const bank = (proBank.data || null) as Record<string, unknown> | null;
    const bankNum = bank?.bank_account_number
      ? String(bank.bank_account_number)
      : "";

    return apiOk({
      payment: {
        id: paymentId,
        request_id: requestId,
        amount_kobo: payment.amount_kobo,
        pro_payout_kobo: payment.pro_payout_kobo,
        platform_fee_kobo: payment.platform_fee_kobo,
        currency: payment.currency || "NGN",
        status: payment.status,
        escrow_status: payment.escrow_status,
        provider: payment.provider,
        provider_ref: payment.provider_ref,
        paid_at: payment.paid_at,
        released_at: payment.released_at,
        refunded_at: payment.refunded_at,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
        meta,
        idempotent_transfer_ref: idemRef || null,
        motorist_id: motoristId,
        repair_pro_id: proId,
      },
      parties: {
        customer: {
          id: motoristId,
          name:
            (motoristProf.data as { full_name?: string } | null)?.full_name ||
            (jobRow?.motorist_name as string) ||
            "",
          phone:
            (motoristProf.data as { phone?: string } | null)?.phone || null,
          email:
            (motoristProf.data as { email?: string } | null)?.email || null,
        },
        pro: {
          id: proId,
          name:
            (proProf.data as { full_name?: string } | null)?.full_name ||
            (jobRow?.repair_pro_name as string) ||
            "",
          phone: (proProf.data as { phone?: string } | null)?.phone || null,
          email: (proProf.data as { email?: string } | null)?.email || null,
          bank: bank
            ? {
                bankCode: bank.bank_code ? String(bank.bank_code) : null,
                bankName: bank.bank_name ? String(bank.bank_name) : null,
                accountName: bank.bank_account_name
                  ? String(bank.bank_account_name)
                  : null,
                accountLast4: bankNum ? bankNum.slice(-4) : null,
                accountNumber: bankNum || null,
              }
            : null,
        },
      },
      job: jobRow,
      ledger: [...ledgerMap.values()],
      flwTransfers: [...flwMap.values()].sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      ),
      flwLookup: existingCheck,
      doublePayRisk:
        [...flwMap.values()].filter((t) =>
          /success/i.test(String(t.status || "")),
        ).length > 1
          ? "Multiple SUCCESSFUL Flutterwave transfers found review amounts and refs"
          : null,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail(
      e instanceof Error ? e.message : "Failed to load payment detail",
      500,
    );
  }
}
