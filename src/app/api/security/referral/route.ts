import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getOrCreateReferralCode,
  createReferralEvent,
  listReferralEvents,
} from "@/lib/server/security/security-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return apiFail("userId required", 400);
    const code = await getOrCreateReferralCode(userId);
    if ("error" in code) return apiFail(code.error, 400);
    const events = await listReferralEvents({ referrerUserId: userId });
    return apiOk({ code, events });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { referrerUserId, referredUserId, referralCodeUsed } = body;
    if (!referrerUserId || !referredUserId) {
      return apiFail("Missing referrerUserId or referredUserId", 400);
    }
    const result = await createReferralEvent({ referrerUserId, referredUserId, referralCodeUsed });
    if ("error" in result) return apiFail(result.error, 400);
    return apiOk({ event: result });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
