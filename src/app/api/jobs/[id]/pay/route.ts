import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { mockPayJob } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  motoristId: z.string().min(1),
  email: z.string().email().optional(),
  /** Future: paystack | flutterwave | mock */
  provider: z.enum(["mock", "paystack", "flutterwave"]).optional().default("mock"),
});

/**
 * Escrow payment. Currently mock provider runs real state machine.
 * Live Paystack/Flutterwave can be wired via existing /api/payments/init.
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

    // Always mock path for now (real state machine + held escrow)
    const res = await mockPayJob({
      jobId: id,
      motoristId: b.motoristId,
      email: b.email,
    });
    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({
      job: res.job,
      reference: res.reference,
      provider: "mock",
      message: "Payment held in escrow (mock). 5% platform · 95% Repair Pro reserved.",
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Payment failed", 500);
  }
}
