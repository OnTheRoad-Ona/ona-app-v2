import { apiFail, apiOk } from "@/lib/server/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nigeria banks from Flutterwave (code auto-fills on select in the app).
 * Cached briefly in-memory on the server process.
 */
type Bank = { name: string; code: string };

let cache: { at: number; banks: Bank[] } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000;

const STATIC_FALLBACK: Bank[] = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Globus Bank", code: "00103" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Opay", code: "999992" },
  { name: "PalmPay", code: "999991" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "Suntrust Bank", code: "100" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "VFD Microfinance Bank", code: "566" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

async function fetchFlutterwaveBanks(): Promise<Bank[] | null> {
  const secret = (process.env.FLUTTERWAVE_SECRET_KEY || "").trim();
  if (!secret) return null;
  try {
    const res = await fetch(
      "https://api.flutterwave.com/v3/banks/NG",
      {
        headers: { Authorization: `Bearer ${secret}` },
        next: { revalidate: 0 },
      }
    );
    const json = (await res.json()) as {
      status?: string;
      data?: { id?: number; code?: string; name?: string }[];
    };
    if (json.status !== "success" || !Array.isArray(json.data)) return null;
    const banks = json.data
      .map((b) => ({
        name: String(b.name || "").trim(),
        code: String(b.code || "").trim(),
      }))
      .filter((b) => b.name && b.code)
      .sort((a, b) => a.name.localeCompare(b.name));
    return banks.length ? banks : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return apiOk({
        banks: cache.banks,
        source: "cache",
        country: "NG",
      });
    }

    const live = await fetchFlutterwaveBanks();
    const banks = live || STATIC_FALLBACK;
    cache = { at: Date.now(), banks };

    return apiOk({
      banks,
      source: live ? "flutterwave" : "static_fallback",
      country: "NG",
      note: "Bank code is set automatically when the user selects a bank.",
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not load banks",
      500
    );
  }
}
