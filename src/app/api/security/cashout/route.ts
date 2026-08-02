import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import {
  createCashoutRequest,
  listCashoutRequests,
} from "@/lib/server/security/security-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { userId, requestedAmount, destinationAccount } = body;
    if (!userId || !requestedAmount) {
      return apiFail("Missing required fields", 400);
    }
    if (userId !== auth.userId) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    const result = await createCashoutRequest({
      userId: auth.userId,
      requestedAmount,
      destinationAccount,
    });
    if ("error" in result) return apiFail(result.error, 400);
    return apiOk({ cashout: result.cashout });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    // Never list all cashouts — always scoped to the authenticated user
    if (userId && userId !== auth.userId) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    const requests = await listCashoutRequests({ userId: auth.userId });
    return apiOk({ requests });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
