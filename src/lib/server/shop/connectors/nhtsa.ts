/**
 * NHTSA vPIC connector (Phase 2) vehicle foundation for the catalog.
 *
 * Uses the public NHTSA vPIC API for vehicle makes/models. This is a legal,
 * free, public-data source (no key required). The connector enriches the
 * vehicle_makes / vehicle_models foundation used by vehicle-fitment trades.
 *
 * The connector NEVER fabricates product fitment claims: it only yields
 * vehicle make/model/year foundation rows. Product-level fitment stays in the
 * Ona shop_product_fitments table driven by real application data.
 */

import type {
  CatalogConnector,
  StagedRecord,
} from "@/lib/server/shop/connectors/types";
import { checksum } from "@/lib/server/shop/normalize";

const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

/** Nigeria-common makes for launch (public NHTSA names). */
const MAKES = [
  "Toyota",
  "Honda",
  "Lexus",
  "Mercedes-Benz",
  "BMW",
  "Nissan",
  "Hyundai",
  "Kia",
  "Ford",
  "Volkswagen",
  "Peugeot",
  "Mazda",
  "Mitsubishi",
  "Suzuki",
  "Isuzu",
  "Land Rover",
  "Chevrolet",
  "Acura",
  "Infiniti",
  "Jeep",
];

const PAGE_SIZE = 10;

async function fetchJson(
  path: string,
  signal?: AbortSignal,
): Promise<{ Results?: unknown[] }> {
  const res = await fetch(`${BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`NHTSA vPIC ${res.status} for ${path}`);
  return res.json() as Promise<{ Results?: unknown[] }>;
}

async function getModelsForMake(make: string, signal?: AbortSignal) {
  return fetchJson(
    `/GetModelsForMake/${encodeURIComponent(make)}?format=json`,
    signal,
  );
}

export class NhtsaVpicConnector implements CatalogConnector {
  readonly code = "nhtsa_vpic";
  readonly name = "NHTSA vPIC";
  readonly license =
    "NHTSA Open Data public domain, free of charge, no API key required";
  readonly licenseUrl = "https://vpic.nhtsa.dot.gov/";
  readonly homepageUrl = "https://vpic.nhtsa.dot.gov/api/vehicles";
  readonly sourceCode = "nhtsa_vpic";

  private cached: StagedRecord[] | null = null;

  async fetchRecords(opts?: {
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  }): Promise<{ records: StagedRecord[]; hasMore: boolean; total?: number }> {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? PAGE_SIZE;

    if (!this.cached) {
      const out: StagedRecord[] = [];
      for (const make of MAKES) {
        try {
          const json = await getModelsForMake(make, opts?.signal);
          const results = (json.Results ?? []) as Array<
            Record<string, unknown>
          >;
          if (!results.length) continue;
          const seen = new Set<string>();
          for (const row of results) {
            const model = String(row.Model_Name ?? row.ModelName ?? "").trim();
            if (!model || seen.has(model)) continue;
            seen.add(model);
            out.push({
              externalId: `${String(row.Make_ID ?? "")}:${model}`,
              externalCategory: "Vehicle Catalog > Make > Model",
              tradeKey: "diagnostics",
              name: `${make} ${model}`,
              subtitle: "Vehicle make/model (NHTSA vPIC foundation)",
              brand: { slug: "nhtsa-vpic", name: make },
              sku: `NHTSA-${String(row.Make_ID ?? "0")}-${model.replace(/\s+/g, "-")}`,
              raw: {
                source: "nhtsa_vpic",
                make: row.Make ?? make,
                make_id: row.Make_ID,
                model,
                model_id: row.Model_ID,
              },
            });
          }
        } catch (e) {
          // Network resilience: skip failing make, continue the batch.
          if ((e as Error).name === "AbortError") throw e;
          out.push({
            externalId: `err:${make}`,
            externalCategory: "__connector_error__",
            name: `${make} (NHTSA fetch error)`,
            raw: {
              source: "nhtsa_vpic",
              error: (e as Error).message,
              make,
            },
          });
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      this.cached = out;
    }

    const start = (page - 1) * pageSize;
    const records = this.cached.slice(start, start + pageSize);
    return {
      records,
      hasMore: start + records.length < this.cached.length,
      total: this.cached.length,
    };
  }

  /** Checksum for change detection. */
  checksumFor(record: StagedRecord): string {
    return checksum(record.raw);
  }
}
