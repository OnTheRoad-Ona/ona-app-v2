import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  createCashoutRequest,
  listCashoutRequests,
} from "@/lib/server/security/security-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, requestedAmount, destinationAccount } = body;
    if (!userId || !requestedAmount) {
      return apiFail("Missing required fields", 400);
    }
    const result = await createCashoutRequest({ userId, requestedAmount, destinationAccount });
    if ("error" in result) return apiFail(result.error, 400);
    return apiOk({ cashout: result.cashout });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const requests = await listCashoutRequests({ userId: userId || undefined });
    return apiOk({ requests });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
