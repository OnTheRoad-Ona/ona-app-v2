/**
 * User payment / payout history for Settings and history screens.
 * Motorist: total paid + escrow status (no 95/5 split).
 * Pro: expected payout + release status.
 */

import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { listEscrowForUser } from "@/lib/server/payments/escrow-store";
import type { EscrowPayment } from "@/lib/server/payments/escrow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function humanStatus(
  p: EscrowPayment,
  role: "motorist" | "professional",
): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  const esc = String(p.escrowStatus || "").toLowerCase();
  const meta = p.meta || {};
  const payoutStatus = String(meta.payoutStatus || "").toLowerCase();

  if (esc === "released" || payoutStatus === "success") {
    return {
      label: role === "professional" ? "Paid out" : "Released",
      tone: "ok",
    };
  }
  if (esc === "pending_settlement" || esc === "release_pending") {
    return {
      label:
        role === "professional" ? "Payout processing" : "Payment processing",
      tone: "warn",
    };
  }
  if (esc === "held") {
    return {
      label: role === "professional" ? "Held (job open)" : "Held",
      tone: "warn",
    };
  }
  if (
    esc === "pending_payment" ||
    esc === "pending" ||
    p.status === "pending"
  ) {
    return { label: "Awaiting payment", tone: "muted" };
  }
  if (esc === "refunded") {
    return {
      label: role === "professional" ? "Refunded" : "Refunded",
      tone: "muted",
    };
  }
  if (esc === "failed" || payoutStatus === "failed") {
    return { label: "Failed. Contact support", tone: "bad" };
  }
  return { label: esc || p.status || "Unknown", tone: "muted" };
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const roleParam = (
      url.searchParams.get("role") || "motorist"
    ).toLowerCase();
    const role: "motorist" | "professional" =
      roleParam === "professional" ||
      roleParam === "repair_pro" ||
      roleParam === "pro"
        ? "professional"
        : "motorist";

    if (!userId) return apiFail("userId required", 400);
    if (userId !== auth.userId) return apiFail("Forbidden", 403, "forbidden");

    const raw = await listEscrowForUser(auth.userId);

    // Prefer rows that matter for this role
    const filtered = raw.filter((p) => {
      if (role === "motorist") return p.motoristId === userId;
      return p.repairProId === userId;
    });

    const payments = filtered.map((p) => {
      const meta = p.meta || {};
      const status = humanStatus(p, role);
      const base = {
        id: p.id,
        requestId: p.requestId,
        currency: p.currency,
        escrowStatus: p.escrowStatus,
        statusLabel: status.label,
        statusTone: status.tone,
        provider: p.provider,
        providerRef: p.providerRef,
        paidAt: p.paidAt,
        releasedAt: p.releasedAt,
        refundedAt: p.refundedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        /** Customer always sees total charged */
        amountMinor: p.amountMinor,
        href: `/jobs/${p.requestId}`,
      };

      if (role === "professional") {
        return {
          ...base,
          /** Pro sees what they should receive */
          proPayoutMinor: p.proPayoutMinor,
          platformFeeMinor: p.platformFeeMinor,
          payoutStatus: meta.payoutStatus ?? null,
          nextRetryAt: meta.nextRetryAt ?? null,
          showSplit: true as const,
        };
      }

      // Motorist: no 95/5 breakdown
      return {
        ...base,
        proPayoutMinor: null,
        platformFeeMinor: null,
        payoutStatus: meta.payoutStatus ?? null,
        nextRetryAt: meta.nextRetryAt ?? null,
        showSplit: false as const,
        /** Optional fee lines without calling it “pro split” */
        labourMinor: meta.labourMinor != null ? Number(meta.labourMinor) : null,
        vatMinor: meta.vatMinor != null ? Number(meta.vatMinor) : null,
      };
    });

    const summary = {
      totalCount: payments.length,
      heldCount: payments.filter((p) =>
        ["held", "pending_settlement", "release_pending"].includes(
          String(p.escrowStatus),
        ),
      ).length,
      releasedCount: payments.filter(
        (p) =>
          p.escrowStatus === "released" ||
          p.statusLabel === "Released" ||
          p.statusLabel === "Paid out",
      ).length,
      processingCount: payments.filter((p) =>
        String(p.statusLabel).toLowerCase().includes("processing"),
      ).length,
      refundedCount: payments.filter((p) => p.escrowStatus === "refunded")
        .length,
      heldMinor: payments
        .filter((p) =>
          ["held", "pending_settlement", "release_pending"].includes(
            String(p.escrowStatus),
          ),
        )
        .reduce(
          (a, p) =>
            a +
            (role === "professional"
              ? Number(p.proPayoutMinor) || 0
              : Number(p.amountMinor) || 0),
          0,
        ),
      releasedMinor: payments
        .filter(
          (p) =>
            p.escrowStatus === "released" ||
            p.statusLabel === "Paid out" ||
            p.statusLabel === "Released",
        )
        .reduce(
          (a, p) =>
            a +
            (role === "professional"
              ? Number(p.proPayoutMinor) || 0
              : Number(p.amountMinor) || 0),
          0,
        ),
    };

    return apiOk({
      role,
      payments,
      summary,
      bankRequired: role === "professional",
      notes:
        role === "professional"
          ? "We pay you to the bank you saved. If a payout is still processing, we try again for you."
          : "We hold your money until you say the job is done. Refunds are handled by Ona support.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "History failed";
    return apiFail(msg, 500);
  }
}
