import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { listCashoutRequests } from "@/lib/server/security/security-store";
import { requestCashout } from "@/lib/server/security/cashout-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { userId, requestedAmount, destinationAccount, idempotencyKey } = body;
    if (!userId || !requestedAmount) {
      return apiFail("Missing required fields", 400);
    }
    if (userId !== auth.userId) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    // Engine: flag gate, limits/velocity, idempotency, bank on file,
    // auto-approve under threshold. Response shape unchanged.
    const result = await requestCashout({
      userId: auth.userId,
      requestedAmount,
      destinationAccount,
      idempotencyKey:
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    });
    if (!result.ok) return apiFail(result.error, 400);
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
    // Never list all cashouts always scoped to the authenticated user
    if (userId && userId !== auth.userId) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    const requests = await listCashoutRequests({ userId: auth.userId });
    return apiOk({ requests });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
