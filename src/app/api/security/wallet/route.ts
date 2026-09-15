import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import {
  getOrCreateWallet,
  listCreditTransactions,
} from "@/lib/server/security/credit-wallets";

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

    const wallet = await getOrCreateWallet(auth.userId);
    const txs = await listCreditTransactions(auth.userId);
    return apiOk({ wallet, transactions: txs });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
