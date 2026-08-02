import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import {
  getOrCreateReferralCode,
  createReferralEvent,
  listReferralEvents,
} from "@/lib/server/security/security-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return apiFail("userId required", 400);
    if (userId !== auth.userId) return apiFail("Forbidden", 403, "forbidden");

    const code = await getOrCreateReferralCode(auth.userId);
    if ("error" in code) return apiFail(code.error, 400);
    const events = await listReferralEvents({ referrerUserId: auth.userId });
    return apiOk({ code, events });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { referrerUserId, referredUserId, referralCodeUsed } = body;
    if (!referrerUserId || !referredUserId) {
      return apiFail("Missing referrerUserId or referredUserId", 400);
    }
    // Only the referred user (or system on signup) should create — bind to session
    if (
      referrerUserId !== auth.userId &&
      referredUserId !== auth.userId
    ) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    const result = await createReferralEvent({
      referrerUserId,
      referredUserId,
      referralCodeUsed,
    });
    if ("error" in result) return apiFail(result.error, 400);
    return apiOk({ event: result });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
