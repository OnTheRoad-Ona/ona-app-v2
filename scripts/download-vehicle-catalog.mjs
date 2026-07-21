/**
 * Build offline vehicle catalog (make → models → years) from NHTSA vPIC.
 * Output: src/lib/data/vehicles-catalog.json
 *
 * Run: node scripts/download-vehicle-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../src/lib/data/vehicles-catalog.json");
const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

/** Global + Africa-relevant manufacturers (expanded with NHTSA matches). */
const SEED_MAKES = [
  "Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Buick",
  "BYD", "Cadillac", "Changan", "Chery", "Chevrolet", "Chrysler", "Citroen",
  "Dacia", "Daewoo", "Dodge", "Dongfeng", "Ferrari", "Fiat", "Ford", "GAC",
  "Geely", "Genesis", "GMC", "Great Wall", "Haval", "Honda", "Hongqi",
  "Hyundai", "Infiniti", "Innoson", "Jaguar", "Jeep", "Kia", "Lada",
  "Lamborghini", "Land Rover", "Lexus", "Lincoln", "Maserati", "Mazda",
  "McLaren", "Mercedes-Benz", "MG", "MINI", "Mitsubishi", "Nissan", "Opel",
  "Peugeot", "Polestar", "Porsche", "Proton", "Ram", "Renault", "Rolls-Royce",
  "SAIC", "SEAT", "Skoda", "SsangYong", "Subaru", "Suzuki", "Tata", "Tesla",
  "Toyota", "Vauxhall", "Volkswagen", "Volvo", "Ashok Leyland", "DAF",
  "Foton", "Freightliner", "Hino", "Howo", "Isuzu", "Iveco", "JAC",
  "Kenworth", "Mack", "MAN", "Mitsubishi Fuso", "Peterbilt", "Scania",
  "Sinotruk", "UD Trucks", "Aprilia", "Bajaj", "Benelli", "BMW Motorrad",
  "CFMoto", "Ducati", "Haojue", "Harley-Davidson", "Hero", "Indian",
  "Kawasaki", "KTM", "Kymco", "Piaggio", "Royal Enfield", "TVS", "Vespa",
  "Yamaha", "Zontes", "Case", "Caterpillar", "John Deere", "JCB", "Kubota",
  "Komatsu", "New Holland", "Massey Ferguson", "Sany", "XCMG", "Yutong",
  "King Long", "Higer", "Golden Dragon", "Zhongtong", "Pontiac", "Saturn",
  "Oldsmobile", "Mercury", "Hummer", "Saab", "Smart", "Maybach", "Bugatti",
  "Koenigsegg", "Pagani", "Rivian", "Lucid", "Fisker", "Lotus", "Morgan",
  "Bentley", "Holden", "Perodua", "Daihatsu", "Scion", "Geo", "Plymouth",
  "Eagle", "AMC", "Wuling", "Baojun", "NIO", "XPeng", "Li Auto", "VinFast",
  "Mahindra", "Maruti", "Force Motors", "Ashok", "Eicher", "BharatBenz",
  "FAW", "JAC Motors", "Great Wall Motors", "Maxus", "LDV", "Ssangyong",
  "Triumph", "Norton", "Moto Guzzi", "MV Agusta", "Husqvarna", "GasGas",
  "Can-Am", "Polaris", "BRP", "Sea-Doo", "Ski-Doo", "Arctic Cat",
  "International", "Navistar", "Western Star", "Autocar", "Blue Bird",
  "Thomas Built", "IC Bus", "Gillig", "New Flyer", "Proterra", "BYD Auto",
  "Toyota Motor Corporation", "General Motors", "Stellantis", "Honda Motor",
  "BAIC", "Chery Automobile", "Geely Automobile", "Great Wall Motor",
  "Innoson Vehicle Manufacturing", "IVM", "Nord", "Oushang", "Changan Auto",
  "GWM", "Ora", "Tank", "Jetour", "Exeed", "Omoda", "Jaecoo", "Skywell",
  "DFSK", "Forthing", "Seres", "Aion", "Hyptec", "Zeekr", "Lynk & Co",
  "Polestar Automotive", "Cupra", "DS Automobiles", "Alpine", "Lancia",
  "Abarth", "Alfa", "Maserati", "McLaren Automotive", "Rimac",
];

const YEAR_START = 1980;
const YEAR_END = new Date().getFullYear() + 1;
const CONCURRENCY = 8;

function titleCase(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => {
      if (!w) return w;
      if (w.toUpperCase() === w && w.length <= 4) return w; // BMW, GMC, MG
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/\bBenz\b/i, "Benz")
    .replace(/^Bmw\b/i, "BMW")
    .replace(/^Gmc\b/i, "GMC")
    .replace(/^Mg\b/i, "MG")
    .replace(/^Ktm\b/i, "KTM")
    .replace(/^Tvs\b/i, "TVS")
    .replace(/^Byd\b/i, "BYD")
    .replace(/^Jac\b/i, "JAC")
    .replace(/^Man\b/i, "MAN")
    .replace(/^Daf\b/i, "DAF")
    .replace(/^Mini\b/i, "MINI");
}

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  console.log("Fetching all NHTSA makes…");
  const allMakesRaw = await fetchJson(`${BASE}/getallmakes?format=json`);
  const nhtsaNames = (allMakesRaw.Results || []).map((r) =>
    String(r.Make_Name || "").trim()
  ).filter(Boolean);

  const seedUpper = new Set(SEED_MAKES.map((m) => m.toUpperCase()));
  // Prefer seed matches + common OEM-looking names (no LLC/INC noise for model fetch)
  const forModels = new Set();
  for (const n of nhtsaNames) {
    const u = n.toUpperCase();
    if (seedUpper.has(u)) forModels.add(n);
  }
  for (const seed of SEED_MAKES) {
    const hit = nhtsaNames.find((n) => n.toUpperCase() === seed.toUpperCase());
    if (hit) forModels.add(hit);
    else forModels.add(seed); // keep Africa/global brands even if not in NHTSA
  }
  // Add more real manufacturers: short-ish names without LLC/INC/CUSTOMS
  for (const n of nhtsaNames) {
    const u = n.toUpperCase();
    if (
      u.includes("LLC") ||
      u.includes("INC.") ||
      u.includes(" INC") ||
      u.includes("CUSTOM") ||
      u.includes("KUSTOM") ||
      u.includes("TRAILER") ||
      u.includes("COACHWORKS") ||
      u.length > 40
    ) {
      continue;
    }
    if (/^[A-Z0-9][A-Z0-9 &\-'.]{1,28}$/i.test(n) && forModels.size < 900) {
      forModels.add(n);
    }
  }

  const makeList = [...forModels].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  console.log(`Fetching models for ${makeList.length} makes…`);

  const modelsByMake = {};
  let done = 0;
  await mapPool(makeList, CONCURRENCY, async (make) => {
    try {
      const url = `${BASE}/GetModelsForMake/${encodeURIComponent(make)}?format=json`;
      const json = await fetchJson(url);
      const models = [
        ...new Set(
          (json.Results || [])
            .map((r) => String(r.Model_Name || "").trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      const key = titleCase(make);
      if (!modelsByMake[key]) modelsByMake[key] = models;
      else {
        modelsByMake[key] = [
          ...new Set([...modelsByMake[key], ...models]),
        ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      }
    } catch (e) {
      const key = titleCase(make);
      if (!modelsByMake[key]) modelsByMake[key] = [];
      console.warn("models fail", make, e.message);
    }
    done++;
    if (done % 40 === 0) console.log(`  models ${done}/${makeList.length}`);
  });

  // Merge seed brands that still need empty model lists
  for (const s of SEED_MAKES) {
    const k = titleCase(s);
    if (!modelsByMake[k]) modelsByMake[k] = [];
  }

  const makes = Object.keys(modelsByMake).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  // Year coverage: probe year×make for high-coverage brands (accurate model years).
  // Other make+model pairs fall back to defaultYears (1980–next year).
  console.log("Building year maps for top makes…");
  const yearsByMakeModel = {};
  const makesWithModels = makes.filter((m) => (modelsByMake[m] || []).length > 0);
  const priority = SEED_MAKES.map((s) => titleCase(s));
  const ranked = [
    ...priority.filter((m) => makesWithModels.includes(m)),
    ...makesWithModels
      .map((m) => ({ m, n: modelsByMake[m].length }))
      .sort((a, b) => b.n - a.n)
      .map((x) => x.m),
  ]
    .filter((m, i, arr) => arr.indexOf(m) === i)
    .slice(0, 80);

  const years = [];
  for (let y = YEAR_START; y <= YEAR_END; y++) years.push(y);

  // Parallelize (make, year) pairs instead of serial years per make
  const jobs = [];
  for (const make of ranked) {
    for (const year of years) jobs.push({ make, year });
  }
  let ji = 0;
  await mapPool(jobs, 12, async ({ make, year }) => {
    try {
      const url = `${BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
      const json = await fetchJson(url);
      for (const r of json.Results || []) {
        const model = String(r.Model_Name || "").trim();
        if (!model) continue;
        const key = `${make}|${model}`;
        if (!yearsByMakeModel[key]) yearsByMakeModel[key] = [];
        if (!yearsByMakeModel[key].includes(year)) {
          yearsByMakeModel[key].push(year);
        }
        if (!modelsByMake[make].includes(model)) {
          modelsByMake[make].push(model);
        }
      }
    } catch {
      /* skip */
    }
    ji++;
    if (ji % 200 === 0) console.log(`  year-jobs ${ji}/${jobs.length}`);
  });

  for (const key of Object.keys(yearsByMakeModel)) {
    yearsByMakeModel[key].sort((a, b) => b - a);
  }
  for (const make of ranked) {
    modelsByMake[make].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }

  // Default year list when no per-model map
  const defaultYears = [...years].sort((a, b) => b - a);

  const catalog = {
    version: 1,
    source: "NHTSA vPIC + global seed makes",
    generatedAt: new Date().toISOString(),
    yearStart: YEAR_START,
    yearEnd: YEAR_END,
    makes,
    modelsByMake,
    yearsByMakeModel,
    defaultYears,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(catalog));
  const mb = (fs.statSync(OUT).size / (1024 * 1024)).toFixed(2);
  console.log(
    `Wrote ${OUT} (${mb} MB) · ${makes.length} makes · year maps ${Object.keys(yearsByMakeModel).length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
