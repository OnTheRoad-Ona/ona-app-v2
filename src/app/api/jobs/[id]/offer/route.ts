import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isJobParty, requireUser } from "@/lib/server/auth-utils";
import { acceptOffer, getJob, placeOffer } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["place", "accept"]),
  side: z.enum(["repair_pro", "motorist"]),
  actorId: z.string().min(1),
  // Price cannot be 0; max 6 digits (1 … 999999)
  amountMajor: z.number().int().min(1).max(999_999).optional(),
  // Client idempotency sticker — retries of the same offer reuse it
  clientOfferId: z.string().min(1).max(100).optional().nullable(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid offer payload", 400);
    const b = parsed.data;

    if (b.actorId !== auth.userId) {
      return apiFail("actorId must match the signed-in user", 403);
    }

    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    if (!isJobParty(auth.userId, job)) {
      return apiFail("Forbidden", 403, "forbidden");
    }

    // Bind side to actual party
    const side =
      auth.userId === job.motoristId
        ? ("motorist" as const)
        : ("repair_pro" as const);
    if (b.side !== side) {
      return apiFail("side does not match your role on this job", 403);
    }

    if (b.action === "place") {
      if (b.amountMajor == null) {
        return apiFail("amountMajor required", 400);
      }
      const res = await placeOffer({
        jobId: id,
        side,
        amountMajor: b.amountMajor,
        actorId: auth.userId,
        clientOfferId: b.clientOfferId || null,
      });
      if ("error" in res) return apiFail(res.error, 400);
      return apiOk({ job: res.job });
    }

    const res = await acceptOffer({
      jobId: id,
      by: side,
      actorId: auth.userId,
    });
    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({ job: res.job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Offer failed", 500);
  }
}
