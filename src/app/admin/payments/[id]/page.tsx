"use client";

/**
 * Admin Payment Control Cockpit
 * — View customer → pro money path, stop processing, force payout, refund.
 * — Does not change payment engine rules; calls existing APIs only.
 * — Force payout / standalone: L4–L5. Refund / stop processing: L3+.
 * — Never double-pays (stable ona_rel_ / ledger + FLW lookup).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { withSensitivePassword } from "@/components/admin/sensitive-unlock";
import {
  adminRoleLabel,
  canCancelEscrowUi,
  canForcePayoutUi,
  normalizeAdminRoleUi,
} from "@/lib/admin-role-ui";

type FlwTransfer = {
  id: string | null;
  reference: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  narration: string | null;
  complete_message: string | null;
  created_at: string | null;
  account_number: string | null;
  bank_name: string | null;
  fee: number | null;
};

type LedgerRow = {
  id: string;
  transferRef: string;
  flwTransferId: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  accountBank: string | null;
  accountNumberLast4: string | null;
  beneficiaryName: string | null;
  createdAt: string;
};

function nairaFromKobo(k: number) {
  return `₦${(k / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminPaymentDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const { adminName, adminRole, ready, api } = useAdminGate();
  const role = normalizeAdminRoleUi(adminRole);
  const canCancel = canCancelEscrowUi(role);
  const canForce = canForcePayoutUi(role);

  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [data, setData] = useState<{
    payment: Record<string, unknown>;
    job: Record<string, unknown> | null;
    parties?: {
      customer: {
        id: string | null;
        name: string;
        phone: string | null;
        email: string | null;
      };
      pro: {
        id: string | null;
        name: string;
        phone: string | null;
        email: string | null;
        bank: {
          bankCode: string | null;
          bankName: string | null;
          accountName: string | null;
          accountLast4: string | null;
          accountNumber: string | null;
        } | null;
      };
    };
    ledger: LedgerRow[];
    flwTransfers: FlwTransfer[];
    doublePayRisk: string | null;
    flwLookup: { found?: boolean; status?: string; reference?: string };
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await api<{
      payment: Record<string, unknown>;
      job: Record<string, unknown> | null;
      parties?: {
            customer: {
              id: string | null;
              name: string;
              phone: string | null;
              email: string | null;
            };
            pro: {
              id: string | null;
              name: string;
              phone: string | null;
              email: string | null;
              bank: {
                bankCode: string | null;
                bankName: string | null;
                accountName: string | null;
                accountLast4: string | null;
                accountNumber: string | null;
              } | null;
            };
          };
      ledger: LedgerRow[];
      flwTransfers: FlwTransfer[];
      doublePayRisk: string | null;
      flwLookup: { found?: boolean; status?: string; reference?: string };
    }>(`/api/admin/payments/${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError(res.message);
      setData(null);
      return;
    }
    setData(res.data as typeof data);
    setError(null);
  }, [api, id]);

  useEffect(() => {
    if (!ready || !id) return;
    void load();
  }, [ready, id, load]);

  const p = data?.payment;
  const meta = (p?.meta || {}) as Record<string, unknown>;
  const esc = String(p?.escrow_status || "").toLowerCase();
  const alreadyPaid =
    esc === "released" ||
    meta.proTransferOk === true ||
    meta.payoutStatus === "success" ||
    data?.flwLookup?.found === true;

  const successFlw = useMemo(
    () =>
      (data?.flwTransfers || []).filter((t) =>
        /success/i.test(String(t.status || ""))
      ),
    [data?.flwTransfers]
  );

  async function runAction(
    title: string,
    detail: string,
    body: Record<string, unknown>,
    okMsg: string
  ) {
    setBusy(true);
    setMsg(null);
    setError(null);
    await withSensitivePassword({ title, detail }, async () => {
      const res = await api<{
        message?: string;
        result?: { ok?: boolean; message?: string; alreadyReleased?: boolean };
      }>("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const r = res.data.result;
      if (r && r.ok === false) {
        setError(r.message || "Action did not complete");
      } else {
        setMsg(
          res.data.message ||
            (r?.alreadyReleased
              ? "Already paid (no second transfer)"
              : okMsg)
        );
      }
      await load();
    });
    setBusy(false);
  }

  function requireNote(): string | null {
    const r = note.trim();
    if (r.length < 8) {
      setError("Enter a reason (min 8 characters) in the note box first.");
      return null;
    }
    return r;
  }

  return (
    <AdminShell adminName={adminName} adminRole={adminRole}>
      <div style={{ marginBottom: 12 }}>
        <Link
          href="/admin/payments"
          className="om-admin-muted"
          style={{ fontSize: 13 }}
        >
          ← All payments
        </Link>
      </div>
      <h1 className="om-admin-h1">Payment control</h1>
      <p className="om-admin-sub">
        Full admin cockpit: customer collection → escrow → pro payout.{" "}
        <strong>Never double-pays</strong> (stable transfer ref + ledger + FLW
        check). Your role: {adminRoleLabel(role)}. Force payout: L4–L5. Refund /
        stop processing: L3+.
      </p>

      <AdminGuideBanner pageId="payment-detail" />
      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}
      {data?.doublePayRisk ? (
        <div className="om-admin-error" role="alert">
          {data.doublePayRisk}
        </div>
      ) : null}
      {alreadyPaid ? (
        <div className="om-admin-success" role="status">
          Pro payout already completed (or FLW shows success). Do not force a
          second transfer.
        </div>
      ) : null}

      {!data && !error ? (
        <p className="om-admin-muted">Loading…</p>
      ) : null}

      {p ? (
        <>
          {/* Parties */}
          <div
            className="om-admin-panel"
            style={{
              marginBottom: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div>
              <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
                Customer (payer)
              </h2>
              <p style={{ margin: "4px 0", fontWeight: 700 }}>
                {data?.parties?.customer?.name || "—"}
              </p>
              <p className="om-admin-muted" style={{ fontSize: 12, margin: 0 }}>
                {data?.parties?.customer?.phone || "—"}
                {data?.parties?.customer?.email
                  ? ` · ${data.parties.customer.email}`
                  : ""}
              </p>
              <p className="om-admin-muted" style={{ fontSize: 11, marginTop: 6 }}>
                Paid{" "}
                <strong>{nairaFromKobo(Number(p.amount_kobo) || 0)}</strong>
                {p.paid_at
                  ? ` · ${new Date(String(p.paid_at)).toLocaleString()}`
                  : ""}
              </p>
            </div>
            <div>
              <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
                Repair Pro (payee)
              </h2>
              <p style={{ margin: "4px 0", fontWeight: 700 }}>
                {data?.parties?.pro?.name || "—"}
              </p>
              <p className="om-admin-muted" style={{ fontSize: 12, margin: 0 }}>
                {data?.parties?.pro?.bank?.bankName ||
                  data?.parties?.pro?.bank?.bankCode ||
                  "—"}{" "}
                ·{" "}
                {data?.parties?.pro?.bank?.accountName || "—"} · ****
                {data?.parties?.pro?.bank?.accountLast4 || "????"}
              </p>
              <p className="om-admin-muted" style={{ fontSize: 11, marginTop: 6 }}>
                Pro share{" "}
                <strong>
                  {p.pro_payout_kobo != null
                    ? nairaFromKobo(Number(p.pro_payout_kobo))
                    : "—"}
                </strong>
                {p.platform_fee_kobo != null
                  ? ` · Ona ${nairaFromKobo(Number(p.platform_fee_kobo))}`
                  : ""}
              </p>
            </div>
          </div>

          {/* Escrow status */}
          <div className="om-admin-panel" style={{ marginBottom: 16 }}>
            <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
              Escrow & status
            </h2>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr",
                gap: "6px 12px",
                fontSize: 13,
                margin: 0,
              }}
            >
              <dt className="om-admin-muted">Payment id</dt>
              <dd style={{ margin: 0, wordBreak: "break-all" }}>
                {String(p.id)}
              </dd>
              <dt className="om-admin-muted">Job / request</dt>
              <dd style={{ margin: 0, wordBreak: "break-all" }}>
                {String(p.request_id || "—")}
                {data?.job ? (
                  <span className="om-admin-muted">
                    {" "}
                    · job {String(data.job.flow_status || data.job.status)} ·
                    escrow {String(data.job.escrow_status || "—")}
                  </span>
                ) : null}
              </dd>
              <dt className="om-admin-muted">Escrow status</dt>
              <dd style={{ margin: 0 }}>
                <span className="om-admin-badge">{String(p.escrow_status)}</span>{" "}
                · {String(p.status)}
                {meta.payoutStatus ? (
                  <span className="om-admin-muted">
                    {" "}
                    · payout {String(meta.payoutStatus)}
                  </span>
                ) : null}
              </dd>
              <dt className="om-admin-muted">Collection ref</dt>
              <dd style={{ margin: 0, wordBreak: "break-all" }}>
                {String(p.provider_ref || "—")}
              </dd>
              <dt className="om-admin-muted">Payout ref (idempotent)</dt>
              <dd style={{ margin: 0, wordBreak: "break-all" }}>
                {String(p.idempotent_transfer_ref || "—")}
              </dd>
              <dt className="om-admin-muted">FLW transfer</dt>
              <dd style={{ margin: 0 }}>
                {data?.flwLookup?.found
                  ? `Found · ${data.flwLookup.status || ""} · ${data.flwLookup.reference || ""}`
                  : successFlw.length
                    ? `${successFlw.length} SUCCESS row(s) on FLW`
                    : "No successful transfer found for this ref"}
              </dd>
              <dt className="om-admin-muted">Last error</dt>
              <dd style={{ margin: 0, color: "#b91c1c", fontSize: 12 }}>
                {meta.lastReleaseError
                  ? String(meta.lastReleaseError)
                  : "—"}
              </dd>
              <dt className="om-admin-muted">Retries</dt>
              <dd style={{ margin: 0 }}>
                {meta.payoutRetryCount != null
                  ? String(meta.payoutRetryCount)
                  : "—"}
                {meta.nextRetryAt
                  ? ` · next ${new Date(String(meta.nextRetryAt)).toLocaleString()}`
                  : ""}
              </dd>
            </dl>
          </div>

          {/* Control actions */}
          <div className="om-admin-panel" style={{ marginBottom: 16 }}>
            <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
              Admin controls
            </h2>
            <p className="om-admin-muted" style={{ fontSize: 12, marginTop: 0 }}>
              Reason note (required for stop / force / refund — min 8 characters):
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. FLW Available funded — force release · or customer dispute refund"
              style={{
                width: "100%",
                marginBottom: 12,
                padding: 8,
                fontSize: 13,
                borderRadius: 6,
                border: "1px solid #d1d5db",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                className="om-admin-btn-ghost"
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh status
              </button>

              {canCancel || canForce ? (
                <button
                  type="button"
                  className="om-admin-btn-ghost"
                  disabled={busy || alreadyPaid || esc === "refunded"}
                  onClick={() => {
                    const r = requireNote();
                    if (!r) return;
                    void runAction(
                      "Stop auto-processing",
                      "Stops retries. Funds stay in escrow (not a refund).",
                      {
                        id: String(p.id),
                        action: "cancel_processing",
                        reason: r,
                        jobId: p.request_id || undefined,
                      },
                      "Processing stopped — funds held for manual control"
                    );
                  }}
                >
                  Stop processing
                </button>
              ) : null}

              {canForce ? (
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busy || alreadyPaid || esc === "refunded"}
                  onClick={() => {
                    const r = requireNote();
                    if (!r) return;
                    if (
                      !window.confirm(
                        "Force payout uses the SAME transfer reference. If FLW already paid, it will not pay twice. Continue?"
                      )
                    ) {
                      return;
                    }
                    void runAction(
                      "Force pro payout",
                      "Idempotent FLW transfer (L4–L5). Same ref — no double pay.",
                      {
                        id: String(p.id),
                        action: "force_release",
                        jobId: p.request_id || p.id,
                        reason: r,
                      },
                      "Force payout submitted"
                    );
                  }}
                >
                  Force payout to pro
                </button>
              ) : null}

              {canCancel ? (
                <button
                  type="button"
                  className="om-admin-btn-ghost"
                  disabled={busy || esc === "released" || esc === "refunded"}
                  style={{ color: "#b91c1c" }}
                  onClick={() => {
                    const r = requireNote();
                    if (!r) return;
                    if (
                      !window.confirm(
                        "Refund / cancel escrow? This marks the payment refunded and stops payout."
                      )
                    ) {
                      return;
                    }
                    void runAction(
                      "Cancel escrow / refund",
                      "Marks escrow refunded. Sensitive action.",
                      {
                        id: String(p.id),
                        action: "cancel_escrow",
                        reason: r,
                        status: "refunded",
                        jobId: p.request_id || undefined,
                      },
                      "Escrow cancelled / refunded"
                    );
                  }}
                >
                  Refund customer
                </button>
              ) : null}

              {canCancel && !canForce ? (
                <button
                  type="button"
                  className="om-admin-btn-ghost"
                  disabled={busy || alreadyPaid}
                  onClick={() => {
                    void runAction(
                      "Retry pro payout",
                      "Idempotent retry (respects 10‑min spacing unless already due).",
                      {
                        id: String(p.id),
                        action: "retry_payout",
                        jobId: p.request_id || p.id,
                      },
                      "Retry submitted"
                    );
                  }}
                >
                  Retry payout
                </button>
              ) : null}
            </div>
            {!canForce && !canCancel ? (
              <p className="om-admin-muted" style={{ fontSize: 12, marginTop: 10 }}>
                Your level can view status only. Force / refund needs L3+ (refund)
                or L4–L5 (force).
              </p>
            ) : null}
          </div>

          {/* Ledger */}
          <div className="om-admin-panel" style={{ marginBottom: 16 }}>
            <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
              Transfer ledger (unique ref)
            </h2>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>FLW id</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {!data?.ledger?.length ? (
                  <tr>
                    <td colSpan={5} className="om-admin-muted">
                      No ledger rows yet.
                    </td>
                  </tr>
                ) : (
                  data.ledger.map((r) => (
                    <tr key={r.id}>
                      <td style={{ wordBreak: "break-all", maxWidth: 180 }}>
                        {r.transferRef}
                      </td>
                      <td>
                        <span className="om-admin-badge">{r.status}</span>
                      </td>
                      <td>{nairaFromKobo(r.amountMinor)}</td>
                      <td>{r.flwTransferId || "—"}</td>
                      <td className="om-admin-muted" style={{ fontSize: 12 }}>
                        {r.createdAt
                          ? new Date(r.createdAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* FLW */}
          <div className="om-admin-panel">
            <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
              Flutterwave bank transfers
            </h2>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>FLW id</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Bank / account</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {!data?.flwTransfers?.length ? (
                  <tr>
                    <td colSpan={6} className="om-admin-muted">
                      No Flutterwave transfers matched.
                    </td>
                  </tr>
                ) : (
                  data.flwTransfers.map((t, i) => (
                    <tr key={String(t.id || t.reference || i)}>
                      <td>{t.id || "—"}</td>
                      <td>
                        <span className="om-admin-badge">
                          {t.status || "—"}
                        </span>
                      </td>
                      <td>
                        {t.amount != null
                          ? `₦${Number(t.amount).toLocaleString("en-NG", {
                              minimumFractionDigits: 2,
                            })}`
                          : "—"}
                      </td>
                      <td style={{ wordBreak: "break-all", maxWidth: 160 }}>
                        {t.reference || "—"}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {t.bank_name || ""} {t.account_number || ""}
                        <div className="om-admin-muted">
                          {t.narration || t.complete_message || ""}
                        </div>
                      </td>
                      <td className="om-admin-muted" style={{ fontSize: 12 }}>
                        {t.created_at
                          ? new Date(t.created_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </AdminShell>
  );
}
