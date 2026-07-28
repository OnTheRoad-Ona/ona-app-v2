import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  cancelOpenPaymentSession,
  startJobEscrowPayment,
} from "@/lib/server/jobs/job-store";
import {
  flutterwavePublicKey,
  resolveProvider,
} from "@/lib/server/payments/providers";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  motoristId: z.string().min(1).optional(),
  email: z.string().optional(),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(32).optional(),
  /** flutterwave (default when keys set) | mock (dev only, needs ALLOW_MOCK_PAYMENTS) */
  provider: z.enum(["mock", "paystack", "flutterwave"]).optional(),
  /** Prefer client origin for localhost callback */
  returnOrigin: z.string().url().optional(),
  /** Default true — open Flutterwave modal on Ona page (not a separate page) */
  preferInline: z.boolean().optional(),
  /**
   * cancel: close open pay session without counting a 20‑min attempt;
   * next Pay starts a fresh timer.
   */
  action: z.enum(["start", "cancel"]).optional(),
});

function callbackBase(req: Request, returnOrigin?: string): string {
  if (returnOrigin) {
    try {
      const u = new URL(returnOrigin);
      if (
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.protocol === "https:"
      ) {
        return u.origin;
      }
    } catch {
      /* fall through */
    }
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host?.includes("localhost") ? "http" : "https");
  if (host && (host.includes("localhost") || host.includes("127.0.0.1"))) {
    return `${proto}://${host.split(",")[0].trim()}`;
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

async function resolvePayerEmail(
  motoristId: string,
  fromBody?: string
): Promise<string | null> {
  const raw = (fromBody || "").trim();
  if (raw.includes("@")) return raw;
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("profiles")
      .select("email")
      .eq("id", motoristId)
      .maybeSingle();
    const em = String(data?.email || "").trim();
    return em.includes("@") ? em : null;
  } catch {
    return null;
  }
}

/**
 * Escrow payment for a job.
 * Default: Flutterwave Inline session (stays on Ona) → Booked after verify.
 * action=cancel: close session + reset 20‑min timer (not an attempt).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid payment body", 400);
    const b = parsed.data;

    if (b.action === "cancel") {
      const res = await cancelOpenPaymentSession({
        jobId: id,
        motoristId: b.motoristId || "callback",
      });
      if ("error" in res) return apiFail(res.error, 400);
      return apiOk({
        cancelled: true,
        timerReset: true,
        job: res.job,
        message:
          "Payment closed. Timer reset — Pay again for a fresh 20 minutes.",
      });
    }

    if (!b.motoristId) {
      return apiFail("motoristId is required to start payment", 400);
    }

    const forceMock = b.provider === "mock";
    const allowMock =
      forceMock &&
      (process.env.ALLOW_MOCK_PAYMENTS === "true" ||
        process.env.NODE_ENV !== "production");

    const resolved = resolveProvider(allowMock ? "mock" : b.provider || null);

    if (resolved === "mock" && !allowMock) {
      return apiFail(
        "Payment gateway is not configured. Set FLUTTERWAVE_SECRET_KEY on the server, then restart.",
        503
      );
    }

    const email = await resolvePayerEmail(b.motoristId!, b.email);
    if (!email) {
      return apiFail(
        "A valid email is required for checkout. Update your profile email and try again.",
        400
      );
    }

    const base = callbackBase(req, b.returnOrigin);
    const callbackBaseUrl = `${base}/payments/callback?jobId=${encodeURIComponent(id)}`;

    const res = await startJobEscrowPayment({
      jobId: id,
      motoristId: b.motoristId!,
      email,
      customerName: b.customerName?.trim() || null,
      customerPhone: b.customerPhone?.trim() || null,
      callbackUrl: callbackBaseUrl,
      provider: resolved,
      preferInline: b.preferInline !== false && resolved === "flutterwave",
    });
    if ("error" in res) {
      if (res.error === "ALREADY_PAID") {
        return apiOk({
          alreadyPaid: true,
          jobId: id,
          message: "Payment already received. Job is booked.",
        });
      }
      return apiFail(res.error, 400);
    }

    // Success paths: in-app bank VA, mock URL, or hosted link
    const hasBank =
      Boolean(res.useInAppBankTransfer) &&
      Boolean(res.bankTransfer?.accountNumber);
    const hasLink = Boolean((res.authorizationUrl || "").trim());
    if (!hasBank && !hasLink && !res.useInline) {
      return apiFail(
        res.bankTransfer
          ? "Bank details incomplete. Try Pay again."
          : "Could not start payment. Try again or contact support.",
        502
      );
    }

    return apiOk({
      jobId: res.jobId,
      reference: res.reference,
      provider: res.provider,
      // Never send Flutterwave hosted URL — pay stays on Ona with bank details
      authorizationUrl:
        res.provider === "flutterwave" || hasBank
          ? null
          : res.authorizationUrl || null,
      useInAppBankTransfer: hasBank,
      bankTransfer: hasBank ? res.bankTransfer : null,
      useInline: false,
      publicKey: flutterwavePublicKey() || null,
      amountMajor: res.amountMajor,
      currency: res.currency,
      paymentSessionEndsAt: res.paymentSessionEndsAt,
      paymentAttemptCount: res.paymentAttemptCount,
      paymentAttemptsRemaining: res.paymentAttemptsRemaining,
      returnPath: `/payments/checkout?jobId=${encodeURIComponent(id)}`,
      message: hasBank
        ? "Transfer the exact amount to the account shown."
        : "Complete payment on this page.",
      platformSubaccount:
        process.env.FLUTTERWAVE_PLATFORM_SUBACCOUNT || null,
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Payment failed", 500);
  }
}
