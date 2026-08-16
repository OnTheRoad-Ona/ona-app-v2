import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

type WikiPage = {
  thumbnail?: { source?: string };
  index?: number;
  title?: string;
  imageinfo?: Array<{ thumburl?: string }>;
};

type DemoProduct = {
  id: string;
  trade_key?: string | null;
  category_id?: unknown;
};

const UA = "OnaShopDemo/1.0 (curated demo product photos)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "follow" });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    return res.ok && (ct.includes("image/jpeg") || ct.includes("image/png") || ct.includes("image/webp"));
  } catch {
    return false;
  }
}

function clean(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/** Wikipedia article lead image (redirects resolved). */
async function wikiImage(term: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const u =
        "https://en.wikipedia.org/w/api.php?" +
        new URLSearchParams({
          action: "query",
          format: "json",
          titles: term,
          prop: "pageimages",
          pithumbsize: "640",
          redirects: "1",
        });
      const res = await fetch(u, { headers: { "User-Agent": UA } });
      if (!res.ok) { await sleep(900); continue; }
      const json = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } };
      for (const p of Object.values(json.query?.pages ?? {})) {
        const src = p.thumbnail?.source;
        if (src && (await headOk(src))) return clean(src);
      }
      return null;
    } catch {
      await sleep(900);
    }
  }
  return null;
}

/** Commons search — only accept a file whose title matches a product word. */
async function commonsImage(term: string): Promise<string | null> {
  const must = term
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const u =
        "https://commons.wikimedia.org/w/api.php?" +
        new URLSearchParams({
          action: "query",
          format: "json",
          generator: "search",
          gsrsearch: `${term} filetype:bitmap`,
          gsrnamespace: "6",
          gsrlimit: "12",
          prop: "imageinfo",
          iiprop: "url",
          iiurlwidth: "640",
        });
      const res = await fetch(u, { headers: { "User-Agent": UA } });
      if (!res.ok) { await sleep(900); continue; }
      const json = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } };
      const pages = Object.values(json.query?.pages ?? {}).sort(
        (a: WikiPage, b: WikiPage) => (a.index ?? 99) - (b.index ?? 99)
      );
      for (const p of pages) {
        const title = String(p.title ?? "").toLowerCase();
        if (!/\.(jpg|jpeg|png|webp)$/.test(title)) continue;
        if (!must.some((w) => title.includes(w))) continue;
        const url = p.imageinfo?.[0]?.thumburl;
        if (url && (await headOk(url))) return clean(url);
      }
      return null;
    } catch {
      await sleep(900);
    }
  }
  return null;
}

/** Curated keywords (term used for Wikipedia/Commons lookup). */
const CURATED: Record<string, string> = {
  // mechanic
  "brake-pads": "Brake pad", "brake-discs": "Disc brake", "brake-rotors": "Brake disc",
  "brake-drums": "Drum brake", "brake-shoes": "Brake shoe", "brake-calipers": "Disc brake caliper",
  "brake-fluid": "Brake fluid", "brake-hoses": "Brake hose", "brake-boosters": "Power brakes",
  "brake-master-cylinders": "Brake master cylinder", "brake-hardware": "Brake pad",
  "caliper-repair-kits": "Brake caliper", "parking-brake-components": "Parking brake",
  "abs-components": "Anti-lock braking system", "abs-sensors": "Wheel speed sensor",
  "ball-joints": "Ball joint", "control-arms": "Control arm", "tie-rods": "Tie rod",
  "tie-rod-ends": "Tie rod end", "steering-racks": "Rack and pinion", "steering-boots": "Tie rod",
  "steering-repair-kits": "Steering rack", "shock-absorbers": "Shock absorber",
  struts: "Strut", "strut-mounts": "Strut", "coil-springs": "Coil spring",
  "leaf-springs": "Leaf spring", "stabilizer-links": "Sway bar", bushings: "Bushing (isolator)",
  "suspension-kits": "Suspension (vehicle)", "wheel-bearings": "Wheel bearing",
  "wheel-hubs": "Wheel hub", "engine-oil": "Motor oil", "engine-oil-filters": "Oil filter",
  "diesel-filters": "Fuel filter", "hydraulic-filters": "Hydraulic filter",
  "cabin-filters": "Cabin air filter", "service-filter-kits": "Oil filter",
  cooling: "Radiator (engine cooling)", fuel: "Fuel pump", exhaust: "Exhaust system",
  transmission: "Gearbox", electrical: "Alternator", sensors: "Sensor",
  "led-bulbs": "LED lamp", headlamps: "Headlamp", "tail-lamps": "Automotive lighting",
  "fog-lamps": "Fog lamp", compressors: "Air conditioning", ballasts: "Electrical ballast",
  "power-steering-fluid": "Power steering", "power-steering-pumps": "Power steering",
  "power-steering-hoses": "Power steering", "axle-stands": "Jack stand", jacks: "Jack (device)",
  creepers: "Creeper (tool)", tools: "Wrench", "work-benches": "Workbench",
  maintenance: "Auto mechanic", engine: "Car engine",
  // vulcanizer
  "agricultural-tires": "Tractor tire", "all-season-tires": "All-season tire",
  "all-terrain-tires": "All-terrain tire", "alloy-rims": "Alloy wheel", "alloy-wheel-assemblies": "Alloy wheel",
  "angle-grinders": "Angle grinder", "air-chucks": "Air compressor", "air-hoses": "Compressed air",
  "air-tanks": "Air tank", "air-tools": "Impact wrench", "automatic-tire-changers": "Tire changer",
  autoclaves: "Tire repair", "adhesive-weights": "Wheel balance", "alignment-accessories": "Wheel alignment",
  "alignment-gauges": "Wheel alignment", "balancer-accessories": "Tire balance",
  // battery
  batteries: "Car battery", "battery-accessories": "Battery terminal", "battery-chargers": "Battery charger",
  "battery-tools": "Battery tester", "battery-boxes": "Battery box",
  // towing
  "tow-ropes": "Tow rope", winches: "Winch", "tow-bars": "Tow hitch", "tow-hooks": "Tow hitch",
  // ac
  refrigerant: "Refrigerant", condensers: "Condenser (heat transfer)", evaporators: "Evaporator",
  "ac-tools": "Manifold gauge",
  // body
  bumpers: "Bumper (car)", fenders: "Fender (vehicle)", grilles: "Grille (car)",
  mirrors: "Side mirror", bonnets: "Hood (vehicle)", "body-kits": "Spoiler (car)",
  // electrical
  alternators: "Alternator", starters: "Starter (engine)", wiring: "Electrical wiring",
  "ignition-coils": "Ignition coil",
  // fashion
  "fabrics-textiles": "Fabric (textile)", "sewing-machines": "Sewing machine", "sewing-tools-accessories": "Sewing tools",
  threads: "Thread (yarn)", "buttons-fasteners": "Buttons", zippers: "Zipper", patterns: "Sewing pattern",
  "trims-laces": "Lace", "embroidery-supplies": "Embroidery", "mannequins-display": "Mannequin",
  "tailoring-equipment": "Tailoring", "garments-uniforms": "Clothing",
  // plumber
  taps: "Tap (valve)", sinks: "Sink", toilets: "Toilet", "water-heaters": "Water heating",
  pipes: "Pipe (fluid conveyance)", valves: "Valve", pumps: "Pump",
  // carpenter
  timber: "Lumber", plywood: "Plywood", mdf: "Medium-density fibreboard", boards: "Lumber",
  nails: "Nail (fastener)", screws: "Screw", hinges: "Hinge", handles: "Door handle",
  saws: "Circular saw", drills: "Drill", sanders: "Sander", routers: "Router (woodworking)",
  planers: "Plane (tool)",
  // painter
  "automotive-paint": "Automotive paint", "spray-guns": "Spray painting", rollers: "Paint roller",
  sandpaper: "Sandpaper", thinner: "Paint thinner", primer: "Primer (paint)",
  // solar
  "solar-panels": "Solar panel", inverters: "Power inverter", "charge-controllers": "Charge controller",
  mppt: "Maximum power point tracking", mc4: "MC4 connector", "solar-cables": "Solar cable",
  "solar-lighting": "Solar lamp", "solar-pumps": "Solar pump", "solar-batteries": "Solar battery",
  "combiner-boxes": "Photovoltaic system", mounting: "Photovoltaic mounting system",
  // generator
  "control-panels": "Control panel", "transfer-switches": "Transfer switch",
  "portable-generators": "Generator", "standby-generators": "Standby generator",
  "industrial-generators": "Diesel generator", "fuel-systems": "Fuel injection", avr: "Voltage regulator",
  "generator-tools": "Wrench",
};

/** Trade-level fallback terms when the category has no usable image. */
const TRADE_FALLBACK: Record<string, string> = {
  mechanic: "Auto mechanic", vulcanizer: "Tire", towing: "Tow truck", battery: "Car battery",
  ac: "Air conditioning", body: "Car", electrical: "Electrical wiring", diagnostics: "OBD-II diagnostics",
  fashion: "Fashion", plumber: "Plumbing", carpenter: "Woodworking", painter: "Painting",
  solar: "Solar energy", generator: "Generator",
};

const memo = new Map<string, string | null>();

async function resolve(slug: string, name: string, trade: string): Promise<string | null> {
  const key = slug || name;
  if (memo.has(key)) return memo.get(key)!;
  const term = CURATED[slug] ?? name;
  let url = await wikiImage(term);
  if (!url) url = await commonsImage(term);
  if (!url) url = await wikiImage(TRADE_FALLBACK[trade] ?? "tool");
  if (!url) url = await commonsImage(TRADE_FALLBACK[trade] ?? "tool");
  memo.set(key, url);
  return url;
}

// ---- main ----
const { data: prods, error: e1 } = await sb
  .from("shop_products")
  .select("id, trade_key, category_id")
  .like("slug", "%-demo-%");
if (e1) throw e1;

const catIds = [...new Set((prods ?? []).map((p) => String(p.category_id)))];
const { data: cats, error: e2 } = await sb
  .from("shop_trade_categories")
  .select("id, name, slug, trade_key")
  .in("id", catIds.length ? catIds : [""]);
if (e2) throw e2;
const catById = new Map((cats ?? []).map((c) => [String(c.id), c]));

const perCat = new Map<string, DemoProduct[]>();
for (const p of prods ?? []) {
  const k = String(p.category_id);
  if (!perCat.has(k)) perCat.set(k, []);
  perCat.get(k)!.push(p);
}

let done = 0, failed = 0;
for (const [catId, items] of perCat) {
  const cat = catById.get(catId);
  const trade = String(items[0].trade_key ?? cat?.trade_key ?? "");
  const url = await resolve(String(cat?.slug ?? ""), String(cat?.name ?? ""), trade);
  if (!url) {
    failed += items.length;
    console.log(`MISS ${trade}/${cat?.slug ?? "?"} (${cat?.name ?? "?"})`);
    continue;
  }
  console.log(`ok   ${trade}/${cat?.slug ?? "?"} <- ${url}`);
  const ids = items.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error } = await sb
      .from("shop_products")
      .update({ primary_image_url: url })
      .in("id", chunk);
    if (error) { console.error("update failed", error.message); failed += chunk.length; }
    else done += chunk.length;
  }
  await sleep(350);
}
console.log(`\nupdated ${done} demo products, ${failed} missing`);
