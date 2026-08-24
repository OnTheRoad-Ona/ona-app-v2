import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { verifyExpressPayment } from "@/lib/server/express/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reference: z.string().min(3),
});

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("reference required", 400);

    const result = await verifyExpressPayment({
      reference: parsed.data.reference.trim(),
      userId: auth.userId,
    });
    return apiOk(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verify failed";
    return apiFail(msg, 400, "EXPRESS_VERIFY_ERROR");
  }
}
