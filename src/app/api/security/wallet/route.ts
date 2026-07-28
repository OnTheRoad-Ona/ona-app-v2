import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getOrCreateWallet,
  createCreditTransaction,
  listCreditTransactions,
} from "@/lib/server/security/security-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return apiFail("userId required", 400);
    const wallet = await getOrCreateWallet(userId);
    const txs = await listCreditTransactions(userId);
    return apiOk({ wallet, transactions: txs });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
