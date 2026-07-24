import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { startJobEscrowPayment } from "@/lib/server/jobs/job-store";
import { resolveProvider } from "@/lib/server/payments/providers";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  motoristId: z.string().min(1),
  email: z.string().optional(),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(32).optional(),
  /** flutterwave (default when keys set) | mock (dev only, needs ALLOW_MOCK_PAYMENTS) */
  provider: z.enum(["mock", "paystack", "flutterwave"]).optional(),
  /** Prefer client origin for localhost callback */
  returnOrigin: z.string().url().optional(),
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
 * Escrow payment for a job (Agreed → Flutterwave checkout → Booked after verify).
 * Always returns authorizationUrl when successful — never silently auto-books.
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

    const email = await resolvePayerEmail(b.motoristId, b.email);
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
      motoristId: b.motoristId,
      email,
      customerName: b.customerName?.trim() || null,
      customerPhone: b.customerPhone?.trim() || null,
      callbackUrl: callbackBaseUrl,
      provider: resolved,
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

    if (!res.authorizationUrl) {
      return apiFail(
        "Checkout link was not created. Try again or contact support.",
        502
      );
    }

    return apiOk({
      jobId: res.jobId,
      reference: res.reference,
      provider: res.provider,
      authorizationUrl: res.authorizationUrl,
      message:
        res.provider === "mock"
          ? "Open mock checkout to complete escrow (dev only)."
          : "Open Flutterwave to pay. Escrow is held and the job becomes Booked after successful payment.",
      platformSubaccount:
        process.env.FLUTTERWAVE_PLATFORM_SUBACCOUNT || null,
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Payment failed", 500);
  }
}
