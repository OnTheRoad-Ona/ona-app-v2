import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { acceptOffer, placeOffer } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["place", "accept"]),
  side: z.enum(["repair_pro", "motorist"]),
  actorId: z.string().min(1),
  // Price cannot be 0; max 6 digits (1 … 999999)
  amountMajor: z.number().int().min(1).max(999_999).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid offer payload", 400);
    const b = parsed.data;

    if (b.action === "place") {
      if (b.amountMajor == null) {
        return apiFail("amountMajor required", 400);
      }
      const res = await placeOffer({
        jobId: id,
        side: b.side,
        amountMajor: b.amountMajor,
        actorId: b.actorId,
      });
      if ("error" in res) return apiFail(res.error, 400);
      return apiOk({ job: res.job });
    }

    const res = await acceptOffer({
      jobId: id,
      by: b.side,
      actorId: b.actorId,
    });
    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({ job: res.job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Offer failed", 500);
  }
}
