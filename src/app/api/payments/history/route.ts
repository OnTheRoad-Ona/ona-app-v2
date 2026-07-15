import { apiFail, apiOk } from "@/lib/server/api-json";
import { listEscrowForUser } from "@/lib/server/payments/escrow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Payout / receipt history for motorist or pro. */
export async function GET(req: Request) {
  try {
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) return apiFail("userId required", 400);
    const payments = await listEscrowForUser(userId);
    return apiOk({ payments });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "History failed";
    return apiFail(msg, 500);
  }
}
