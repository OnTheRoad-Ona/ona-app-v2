#!/usr/bin/env node
/**
 * Self-host all shop product images in Supabase Storage.
 *
 * Downloads every product's current primary_image_url (Wikimedia / LoremFlickr
 * placeholders), re-encodes to a normalized JPEG via sharp (max 800px, q80),
 * uploads to the public `shop-media` bucket, then repoints the DB:
 *   - shop_product_images  -> one primary row per product
 *   - shop_products.primary_image_url -> public storage URL
 *
 * Polite to remote hosts: a global rate limiter (1 request / 1.5s) keeps
 * Wikimedia/LoremFlickr from 429ing. Any URL that still fails after retries
 * gets a generated placeholder image instead, so every product ends up with a
 * fast, self-hosted image. Idempotent: already-self-hosted products are skipped.
 *
 * Usage: node scripts/self-host-shop-images.mjs
 */
import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { config } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "")
  .replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
if (!BASE || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const UA = "OnaShopDemo/1.0 (self-hosting product images)";
const CONCURRENCY = 4;
const STORAGE_PREFIX = "products";

const json = async (path) => {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Polite global download queue ----
// Remote hosts (Wikimedia/LoremFlickr) throttle bursts; we fetch ONE URL at a
// time with a steady gap so we never trip their rate limits. Local storage
// uploads + DB writes still run in parallel across workers.
let fetchChain = Promise.resolve();
function downloadGlobal(u) {
  const run = fetchChain.then(async () => {
    await sleep(1200);
    return fetch(u, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
  });
  fetchChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Shared-per-URL cache so identical placeholder URLs are fetched once. */
const urlCache = new Map();

async function downloadWithRetry(u, attempts = 5) {
  if (urlCache.has(u)) return urlCache.get(u);
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await downloadGlobal(u);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after") || "0");
        const wait = Math.min(
          retryAfter > 0 ? retryAfter * 1000 : 3000 * (i + 1) + Math.random() * 1500,
          45000
        );
        lastErr = new Error(`HTTP ${res.status} ${u}`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${u}`);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.startsWith("image/")) throw new Error(`not an image (${ct}) ${u}`);
      const buf = Buffer.from(await res.arrayBuffer());
      urlCache.set(u, buf);
      return buf;
    } catch (e) {
      lastErr = e;
      if (e.name === "TimeoutError") await sleep(2500 * (i + 1));
    }
  }
  throw lastErr || new Error(`download failed ${u}`);
}

/** Deterministic branded placeholder card with the product name. */
function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 3);
}

function placeholderBuffer(name) {
  const lines = wrapText(name, 18);
  const fontSize = lines.some((l) => l.length > 14) ? 34 : 44;
  const lineHeight = fontSize + 8;
  const total = lines.length * lineHeight;
  const startY = 300 - Math.floor(total / 2) + fontSize;
  const text = lines
    .map(
      (l, i) =>
        `<text x='400' y='${startY + i * lineHeight}' font-family='Helvetica, Arial, sans-serif' font-size='${fontSize}' fill='#1c1c1e' text-anchor='middle' font-weight='bold'>${escapeXml(l)}</text>`
    )
    .join("");
  const svg = Buffer.from(`
<svg width='800' height='600' xmlns='http://www.w3.org/2000/svg'>
  <rect width='100%' height='100%' fill='#E8E9EB'/>
  <rect width='100%' height='6' fill='#FF6B35'/>
  ${text}
  <text x='400' y='500' font-family='Helvetica, Arial, sans-serif' font-size='20' fill='#9ca3af' text-anchor='middle'>Ona Shop</text>
</svg>`);
  return sharp(svg).jpeg({ quality: 80 }).toBuffer();
}

const upload = async (path, buffer, contentType) => {
  const r = await fetch(`${BASE}/storage/v1/object/shop-media/${path}`, {
    method: "POST",
    headers: { ...H, "Content-Type": contentType, "x-upsert": "true" },
    body: buffer,
  });
  if (!r.ok) throw new Error(`upload ${path} -> ${r.status} ${await r.text()}`);
};

async function processProduct(p) {
  const id = p.id;
  const path = `${STORAGE_PREFIX}/${id}/primary.jpg`;
  const url = `${BASE}/storage/v1/object/public/shop-media/${path}`;

  if (p.primary_image_url && p.primary_image_url.startsWith(`${BASE}/storage/v1/object/public/shop-media/`)) {
    return { status: "skipped" };
  }

  let buffer;
  let placeholder = !p.primary_image_url;
  if (p.primary_image_url) {
    try {
      buffer = await downloadWithRetry(p.primary_image_url);
    } catch {
      placeholder = true;
      buffer = await placeholderBuffer(p.name);
    }
  } else {
    buffer = await placeholderBuffer(p.name);
  }

  try {
    buffer = await sharp(buffer)
      .rotate()
      .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
  } catch (e) {
    return { status: "encode-failed", error: e.message };
  }

  try {
    await upload(path, buffer, "image/jpeg");
  } catch (e) {
    return { status: "upload-failed", error: e.message };
  }

  try {
    await fetch(`${BASE}/rest/v1/shop_product_images?product_id=eq.${id}&is_primary=eq.true`, {
      method: "DELETE",
      headers: { ...H, Prefer: "count=exact" },
    });
    await fetch(`${BASE}/rest/v1/shop_product_images`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        product_id: id,
        url,
        storage_path: path,
        sort_order: 0,
        is_primary: true,
        alt_text: p.name,
      }),
    });
    await fetch(`${BASE}/rest/v1/shop_products?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        primary_image_url: url,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    return { status: "db-failed", error: e.message };
  }

  return { status: placeholder ? "placeholder" : "ok" };
}

async function main() {
  const products = await json("shop_products?select=id,name,primary_image_url&limit=3000");
  const targets = products.filter(
    (p) =>
      !p.primary_image_url ||
      !p.primary_image_url.startsWith(`${BASE}/storage/v1/object/public/shop-media/`)
  );
  console.log(`products: ${products.length} | to self-host: ${targets.length}`);

  const counts = {};
  const failures = [];
  let progress = 0;
  let idx = 0;
  const lock = Promise.resolve();
  const next = async () => {
    let i;
    await lock.then(() => { i = idx++; });
    return targets[i];
  };

  const worker = async () => {
    while (true) {
      const p = await next();
      if (!p) break;
      const res = await processProduct(p);
      counts[res.status] = (counts[res.status] || 0) + 1;
      progress++;
      if (progress % 25 === 0 || progress === targets.length) console.log(`  ${progress}/${targets.length}`, counts);
      if (res.status !== "ok" && res.status !== "skipped" && res.status !== "no-image" && res.status !== "placeholder") {
        failures.push({ id: p.id, name: p.name, url: p.primary_image_url, ...res });
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("\nresults:", counts);
  if (failures.length) {
    fs.writeFileSync(resolve(root, "scripts", "self-host-failures.json"), JSON.stringify(failures, null, 2));
    console.log(`failures written to scripts/self-host-failures.json (${failures.length})`);
    for (const f of failures.slice(0, 10)) console.log("  FAIL", f.name, "->", f.status, f.error || "");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
