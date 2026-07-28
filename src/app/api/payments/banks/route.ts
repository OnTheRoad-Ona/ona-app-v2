import { apiFail, apiOk } from "@/lib/server/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Country-geo banks from Flutterwave (code auto-fills on select in the app).
 * Query: ?country=NG (ISO 3166-1 alpha-2). Defaults to NG.
 * Cached briefly in-memory per country.
 */
type Bank = { name: string; code: string };

const cache = new Map<string, { at: number; banks: Bank[] }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

/** Flutterwave bank country codes we support (expand as markets open). */
const FLW_COUNTRY: Record<string, string> = {
  NG: "NG",
  GH: "GH",
  KE: "KE",
  ZA: "ZA",
  UG: "UG",
  TZ: "TZ",
  RW: "RW",
  ZM: "ZM",
};

const NG_STATIC_FALLBACK: Bank[] = [
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

function resolveCountry(raw: string | null): string {
  const iso = (raw || "NG").toUpperCase().slice(0, 2);
  return FLW_COUNTRY[iso] || "NG";
}

async function fetchFlutterwaveBanks(
  flwCountry: string
): Promise<Bank[] | null> {
  const secret = (process.env.FLUTTERWAVE_SECRET_KEY || "").trim();
  if (!secret) return null;
  try {
    const res = await fetch(
      `https://api.flutterwave.com/v3/banks/${encodeURIComponent(flwCountry)}`,
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const country = resolveCountry(searchParams.get("country"));
    const hit = cache.get(country);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return apiOk({
        banks: hit.banks,
        source: "cache",
        country,
      });
    }

    const live = await fetchFlutterwaveBanks(country);
    const banks =
      live || (country === "NG" ? NG_STATIC_FALLBACK : NG_STATIC_FALLBACK);
    cache.set(country, { at: Date.now(), banks });

    return apiOk({
      banks,
      source: live ? "flutterwave" : "static_fallback",
      country,
      note: "Bank code is set automatically when the user selects a bank. List is geo-fenced to the user's country.",
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not load banks",
      500
    );
  }
}
