import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { startExpressBankTransfer } from "@/lib/server/express/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().min(8),
  urgency: z.string().default("normal"),
  email: z.string().email(),
  customerName: z.string().max(120).optional().nullable(),
  customerPhone: z.string().max(40).optional().nullable(),
});

/**
 * Same rails as the normal job checkout: create the Flutterwave VA and
 * return in-app bank transfer details. Polling + final assignment happen
 * via /api/express/payments/verify.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid pay init", 400, "validation");

    const result = await startExpressBankTransfer({
      requestId: parsed.data.requestId,
      userId: auth.userId,
      email: parsed.data.email,
      customerName: parsed.data.customerName || null,
      customerPhone: parsed.data.customerPhone || null,
      urgency: parsed.data.urgency,
    });
    return apiOk(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pay init failed";
    return apiFail(msg, 400, "EXPRESS_PAY_INIT_ERROR");
  }
}
