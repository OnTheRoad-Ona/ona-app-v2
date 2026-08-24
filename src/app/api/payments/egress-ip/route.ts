import { apiFail, apiOk } from "@/lib/server/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Explains permanent payout IP strategy.
 *
 * Customer bank-transfer collections: no IP whitelist needed.
 * Pro payouts (Transfer API): need a FIXED egress IP.
 *
 * Prefer FLUTTERWAVE_TRANSFER_PROXY_URL (static proxy) over Vercel’s rotating IP.
 */
export async function GET() {
  try {
    const proxyUrl = (process.env.FLUTTERWAVE_TRANSFER_PROXY_URL || "")
      .trim()
      .replace(/\/$/, "");
    const hasProxy = Boolean(proxyUrl);
    const hasHttpProxy = Boolean(
      (
        process.env.FIXIE_URL ||
        process.env.QUOTAGUARDSTATIC_URL ||
        process.env.HTTPS_PROXY ||
        ""
      ).trim(),
    );

    // If dedicated proxy is configured, report the proxy’s static IP
    if (hasProxy) {
      try {
        const res = await fetch(`${proxyUrl}/egress-ip`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
          headers: {
            "x-ona-proxy-secret":
              process.env.FLUTTERWAVE_TRANSFER_PROXY_SECRET ||
              process.env.ONA_PROXY_SECRET ||
              "",
          },
        });
        // /egress-ip on our proxy is public; secret optional
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { ip?: string };
          ip?: string;
        };
        const ip =
          json?.data?.ip ||
          (json as { staticEgressIp?: string }).staticEgressIp ||
          null;
        if (ip) {
          return apiOk({
            mode: "static_proxy",
            ip,
            proxyUrl,
            permanent: true,
            note: "Payouts use a fixed-IP proxy. Whitelist this IP once in Flutterwave (IP Whitelisting ON). You do not need to update Vercel IPs.",
            flutterwavePath: "Dashboard → Settings → API → IP Whitelisting",
          });
        }
        // Fallback: try /health
        const h = await fetch(`${proxyUrl}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const hj = (await h.json()) as { staticEgressIp?: string };
        if (hj.staticEgressIp) {
          return apiOk({
            mode: "static_proxy",
            ip: hj.staticEgressIp,
            proxyUrl,
            permanent: true,
            note: "Payouts use a fixed-IP proxy. Whitelist this IP once in Flutterwave.",
            flutterwavePath: "Dashboard → Settings → API → IP Whitelisting",
          });
        }
      } catch {
        /* fall through to vercel ip */
      }
    }

    const controllers = [
      "https://api.ipify.org?format=json",
      "https://ifconfig.me/ip",
    ];
    let ip: string | null = null;
    let source = "";

    for (const url of controllers) {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const text = (await res.text()).trim();
        if (url.includes("ipify")) {
          const j = JSON.parse(text) as { ip?: string };
          if (j.ip) {
            ip = j.ip;
            source = "ipify";
            break;
          }
        } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
          ip = text;
          source = "ifconfig.me";
          break;
        }
      } catch {
        /* try next */
      }
    }

    if (!ip) {
      return apiFail("Could not detect egress IP", 502);
    }

    return apiOk({
      mode: hasHttpProxy ? "http_proxy" : "vercel_rotating",
      ip,
      source,
      region: process.env.VERCEL_REGION || null,
      permanent: false,
      warning:
        "This is Vercel’s current egress IP it CAN change. Do not rely on re-whitelisting forever. Deploy tools/flw-payout-proxy (static IP) and set FLUTTERWAVE_TRANSFER_PROXY_URL.",
      note: hasHttpProxy
        ? "HTTP proxy env detected (Fixie/QuotaGuard). Whitelist the proxy provider’s static IP, not this Vercel IP."
        : "Temporary: you may add this IP now, but set up static proxy for life.",
      setup: {
        docs: "tools/flw-payout-proxy/README.md",
        env: [
          "FLUTTERWAVE_TRANSFER_PROXY_URL",
          "FLUTTERWAVE_TRANSFER_PROXY_SECRET",
        ],
      },
      flutterwavePath: "Dashboard → Settings → API → IP Whitelisting",
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Egress IP lookup failed",
      500,
    );
  }
}
