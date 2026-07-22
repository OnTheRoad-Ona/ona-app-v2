import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountNumber: z.string().min(10).max(12),
  bankCode: z.string().min(1).max(20),
});

/**
 * Flutterwave NUBAN resolve — returns account holder name like bank apps.
 * POST /api/payments/resolve-account
 * { accountNumber, bankCode }
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiFail("Enter a valid 10-digit account number and bank.", 400);
    }

    const accountNumber = parsed.data.accountNumber.replace(/\D/g, "");
    const bankCode = parsed.data.bankCode.trim();
    if (accountNumber.length !== 10) {
      return apiFail("Account number must be 10 digits.", 400);
    }
    if (!bankCode) {
      return apiFail("Select a bank first.", 400);
    }

    const secret = (process.env.FLUTTERWAVE_SECRET_KEY || "").trim();
    if (!secret) {
      return apiFail(
        "Name lookup is unavailable (payment keys not configured).",
        503,
        "no_keys"
      );
    }

    const res = await fetch("https://api.flutterwave.com/v3/accounts/resolve", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_number: accountNumber,
        account_bank: bankCode,
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      status?: string;
      message?: string;
      data?: {
        account_number?: string;
        account_name?: string;
        bank_id?: number;
      };
    } | null;

    if (!res.ok || json?.status !== "success" || !json?.data?.account_name) {
      return apiFail(
        json?.message ||
          "Could not verify account. Check bank and account number.",
        400,
        "resolve_failed"
      );
    }

    return apiOk({
      accountNumber: json.data.account_number || accountNumber,
      accountName: String(json.data.account_name).trim(),
      bankCode,
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Account lookup failed",
      500
    );
  }
}
