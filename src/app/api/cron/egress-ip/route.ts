/**
 * Egress-IP monitor (Vercel Cron + admin).
 *
 * The Flutterwave payout proxy sits behind a fixed egress IP. If the host is
 * rebuilt/redeployed (Fly.io hands VMs a new public IPv4 on each deploy), the
 * egress IP can silently change — and every transfer then fails with the
 * "account administrator" 400 until the new IP is whitelisted on Flutterwave.
 *
 * This route checks the proxy's advertised egress IP against the expected
 * whitelist. When it differs from the expected set AND differs from the last
 * IP we already alerted about, it stores the new IP and sends a Resend email
 * (to ADMIN_SEED_EMAIL) so payouts never stall unseen. One alert per new IP,
 * not one per cron tick.
 */

import { apiFail, apiOk } from "@/lib/server/api-json";
import { sendResendEmail } from "@/lib/server/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Tolerate a few possible IPv4s: the ones currently whitelisted on Flutterwave. */
function expectedIps(): string[] {
  const raw = process.env.FLUTTERWAVE_EGRESS_IPS?.trim();
  if (raw) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  // Default: IPs whitelisted on Flutterwave ↔ Settings ↔ API ↔ IP Whitelisting.
  return ["152.233.48.151", "152.233.42.58"];
}

function cronAuthorized(req: Request): boolean {
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.ONA_CRON_SECRET?.trim(),
    process.env.JOB_EXPIRE_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));
  const auth = req.headers.get("authorization") || "";
  const header =
    req.headers.get("x-cron-secret") || req.headers.get("x-job-expire-secret") || "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") || "";
  for (const secret of secrets) {
    if (auth === `Bearer ${secret}`) return true;
    if (auth === secret) return true;
    if (header === secret) return true;
    if (querySecret === secret) return true;
  }
  if (secrets.length > 0) return false;
  const ua = req.headers.get("user-agent") || "";
  if (ua.includes("vercel-cron")) return true;
  return false;
}

async function fetchEgressIp(): Promise<{ ok: true; ip: string } | { ok: false; error: string }> {
  const proxyUrl =
    process.env.FLUTTERWAVE_TRANSFER_PROXY_URL?.trim() ||
    "https://ona-flw-payout.fly.dev";
  try {
    const res = await fetch(`${proxyUrl.replace(/\/$/, "")}/egress-ip`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { ok: false, error: `proxy HTTP ${res.status}` };
    const json = (await res.json()) as { data?: { ip?: string } };
    const ip = json.data?.ip?.trim();
    if (!ip) return { ok: false, error: "proxy response missing data.ip" };
    return { ok: true, ip };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "proxy unreachable" };
  }
}

/** Read/write the last-IP-we-already-emailed-about from ona_cron_config. */
async function lastAlertedIp(): Promise<string | null> {
  try {
    const { createServiceSupabase } = await import("@/lib/supabase/server");
    const { isSupabaseAdminConfigured } = await import("@/lib/supabase/env");
    if (!isSupabaseAdminConfigured()) return null;
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("ona_cron_config")
      .select("value")
      .eq("name", "egress_ip_last_alerted")
      .maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

async function storeAlertedIp(ip: string): Promise<void> {
  try {
    const { createServiceSupabase } = await import("@/lib/supabase/server");
    const sb = createServiceSupabase();
    await sb
      .from("ona_cron_config")
      .upsert(
        { name: "egress_ip_last_alerted", value: ip, updated_at: new Date().toISOString() },
        { onConflict: "name" }
      );
  } catch {
    // best effort — alert already sent; a failed store only means we may
    // alert again on the next tick, which is acceptable for an IP change.
  }
}

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return apiFail("Unauthorized", 401, "auth");
  }

  const expected = expectedIps();
  const probe = await fetchEgressIp();
  if (!probe.ok) {
    return apiOk({ ok: false, reason: "probe_failed", error: probe.error, expected });
  }

  const ip = probe.ip;
  const isKnown = expected.includes(ip);

  if (isKnown) {
    return apiOk({ ok: true, ip, known: true, expected });
  }

  // Egress IP is NOT whitelisted → payout risk. Alert once per new IP.
  const prev = await lastAlertedIp();
  if (prev === ip) {
    return apiOk({ ok: true, ip, known: false, alreadyAlerted: true, expected });
  }

  const alertTo =
    process.env.ADMIN_SEED_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://336699.vercel.app";

  const subject = "[Ona] Flutterwave payout egress IP changed — whitelist required";
  const text = [
    `The payout proxy egress IP changed and is NOT whitelisted on Flutterwave.`,
    ``,
    `Current egress IP: ${ip}`,
    `Expected (whitelisted): ${expected.join(", ")}`,
    ``,
    `Action: add ${ip} to Flutterwave → Settings → API → IP Whitelisting, then verify:`,
    `${appUrl}/api/cron/egress-ip`,
    ``,
    `Until this is done, NEW payout transfers to Repair Pros will be rejected with`,
    `the "account administrator" 400 error.`,
    ``,
    `— Ona ops`,
  ].join("\n");
  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
    <h1 style="font-size:16px;margin:0 0 12px">Flutterwave payout egress IP changed</h1>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      The payout proxy now egresses from <strong style="color:#dc2626">${ip}</strong>, which is
      not whitelisted on Flutterwave. Transfers to Repair Pros will be rejected until it is added.
    </p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      Expected (whitelisted): <code>${expected.join(", ")}</code>
    </p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      Action: add <code>${ip}</code> to
      <strong>Flutterwave → Settings → API → IP Whitelisting</strong>, then confirm on
      <a href="${appUrl}/api/cron/egress-ip">the monitor</a>.
    </p>
    <p style="font-size:12px;color:#64748b;margin:0">— Ona ops</p>
  </div>`;

  const sent = alertTo ? await sendResendEmail({ to: alertTo, subject, html, text }) : null;
  await storeAlertedIp(ip);

  return apiOk({
    ok: true,
    ip,
    known: false,
    emailed: sent?.ok ?? false,
    alertTo: alertTo ? String(alertTo).replace(/^(\S{2})\S*@/, "$1***@") : "",
    errors: sent && !sent.ok ? [sent.error] : [],
    expected,
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}