/**
 * Ona → Flutterwave Transfer proxy (STATIC IP)
 * --------------------------------------------
 * Vercel serverless egress IPs rotate. Flutterwave Transfer API requires IP
 * whitelist. Run THIS small server on a host with a fixed public IP (Fly,
 * Railway, DigitalOcean, etc.), whitelist THAT IP once in Flutterwave, and
 * point Ona env FLUTTERWAVE_TRANSFER_PROXY_URL at this service.
 *
 * Customer bank-transfer collections do NOT use this proxy.
 *
 * Env:
 *   PORT                          default 8787
 *   FLUTTERWAVE_SECRET_KEY        FLW secret (same as Ona) — or pass via Ona only
 *   ONA_PROXY_SECRET              shared secret (must match Ona env)
 *   ALLOW_ONA_SECRET              if "true", accept FLW secret from Ona request
 *                                 (recommended: keep secret only on this proxy)
 *
 * Deploy (Fly example):
 *   cd tools/flw-payout-proxy
 *   fly launch --name ona-flw-payout --region iad
 *   fly ips allocate-v4
 *   fly secrets set ONA_PROXY_SECRET=... FLUTTERWAVE_SECRET_KEY=...
 *   fly deploy
 *   # Whitelist the allocated IPv4 in Flutterwave IP Whitelisting (ON)
 *   # Ona Vercel: FLUTTERWAVE_TRANSFER_PROXY_URL=https://ona-flw-payout.fly.dev
 *   #             FLUTTERWAVE_TRANSFER_PROXY_SECRET=same-as-ONA_PROXY_SECRET
 */

import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const PROXY_SECRET = (process.env.ONA_PROXY_SECRET || "").trim();
const FLW_SECRET = (process.env.FLUTTERWAVE_SECRET_KEY || "").trim();
const ALLOW_ONA_SECRET = process.env.ALLOW_ONA_SECRET === "true";

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function egressIp() {
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    return j.ip || null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // Health + show THIS machine’s public IP (whitelist this forever)
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    const ip = await egressIp();
    return json(res, 200, {
      ok: true,
      service: "ona-flw-payout-proxy",
      staticEgressIp: ip,
      note: "Add staticEgressIp to Flutterwave → Settings → API → IP Whitelisting (ON). Do this once.",
    });
  }

  if (req.method === "GET" && url.pathname === "/egress-ip") {
    const ip = await egressIp();
    if (!ip) return json(res, 502, { ok: false, error: "Could not detect IP" });
    return json(res, 200, {
      ok: true,
      data: {
        ip,
        note: "Whitelist this IP once in Flutterwave. It should not change on this host.",
      },
    });
  }

  // POST /v3/transfers  — same body as Flutterwave Transfer API
  if (req.method === "POST" && url.pathname === "/v3/transfers") {
    const authHeader = String(req.headers["x-ona-proxy-secret"] || "");
    if (!PROXY_SECRET || authHeader !== PROXY_SECRET) {
      return json(res, 401, { status: "error", message: "Unauthorized proxy" });
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { status: "error", message: "Invalid JSON body" });
    }

    const secretFromOna = String(
      req.headers["x-flutterwave-secret"] || ""
    ).trim();
    const secret =
      FLW_SECRET ||
      (ALLOW_ONA_SECRET && secretFromOna ? secretFromOna : "");
    if (!secret) {
      return json(res, 500, {
        status: "error",
        message:
          "Proxy missing FLUTTERWAVE_SECRET_KEY (set on proxy host, or ALLOW_ONA_SECRET=true)",
      });
    }

    try {
      const flw = await fetch("https://api.flutterwave.com/v3/transfers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await flw.text();
      res.writeHead(flw.status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(text);
      return;
    } catch (e) {
      return json(res, 502, {
        status: "error",
        message: e instanceof Error ? e.message : "Upstream transfer failed",
      });
    }
  }

  return json(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`[ona-flw-payout-proxy] listening on :${PORT}`);
});
