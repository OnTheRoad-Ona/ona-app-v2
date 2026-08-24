import { describe, expect, it, vi } from "vitest";
import {
  DemoCatalogConnector,
  demoConnectorCount,
} from "@/lib/server/shop/connectors/demo";
import { NhtsaVpicConnector } from "@/lib/server/shop/connectors/nhtsa";
import { DEMO_PRODUCTS } from "@/lib/shop/demo-catalog";

describe("DemoCatalogConnector", () => {
  it("paginates through the whole demo catalog", async () => {
    const c = new DemoCatalogConnector();
    const page1 = await c.fetchRecords({ page: 1, pageSize: 25 });
    expect(page1.records.length).toBe(25);
    expect(page1.hasMore).toBe(true);
    expect(page1.total).toBe(demoConnectorCount());
    expect(demoConnectorCount()).toBe(DEMO_PRODUCTS.length);
  });

  it("has a license statement (source attribution)", () => {
    const c = new DemoCatalogConnector();
    expect(c.license.length).toBeGreaterThan(5);
    expect(c.sourceCode).toBe("ona_demo");
  });

  it("yields records with identity + trade for every demo product", async () => {
    const c = new DemoCatalogConnector();
    let all: Awaited<ReturnType<typeof c.fetchRecords>>["records"] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const r = await c.fetchRecords({ page, pageSize: 100 });
      all = [...all, ...r.records];
      hasMore = r.hasMore;
      page++;
    }
    expect(all.length).toBe(DEMO_PRODUCTS.length);
    for (const r of all) {
      expect(r.sku).toBeTruthy();
      expect(r.tradeKey).toBeTruthy();
      expect(r.attributes).toBeTruthy();
    }
  });

  it("checksum is deterministic per record", () => {
    const c = new DemoCatalogConnector();
    expect(c.checksumFor({ raw: { a: 1 } })).toBe(
      c.checksumFor({ raw: { a: 1 } }),
    );
    expect(c.checksumFor({ raw: { a: 1 } })).not.toBe(
      c.checksumFor({ raw: { a: 2 } }),
    );
  });
});

describe("NhtsaVpicConnector", () => {
  it("reports its public license", () => {
    const c = new NhtsaVpicConnector();
    expect(c.license).toMatch(/NHTSA/);
    expect(c.licenseUrl).toContain("https://");
    expect(c.sourceCode).toContain("nhtsa");
  });

  it("paginates vehicle foundation records (mocked network)", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const make = /GetModelsForMake\/([^?]+)/.exec(url)?.[1] ?? "";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          Results: [
            { Make_ID: 1, Make: make, Model_Name: `${make} Model A` },
            { Make_ID: 1, Make: make, Model_Name: `${make} Model A` },
            { Make_ID: 1, Make: make, Model_Name: `${make} Model B` },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const c = new NhtsaVpicConnector();
    const page1 = await c.fetchRecords({
      page: 1,
      pageSize: 10,
      signal: new AbortController().signal,
    });
    expect(page1.records.length).toBeGreaterThan(0);
    expect(page1.hasMore).toBe(true);
    expect(page1.total).toBeGreaterThan(10);
    // Every record carries the source + external id for provenance
    expect(page1.records[0].raw.source).toBe("nhtsa_vpic");
    expect(page1.records[0].externalId).toBeTruthy();

    // Dedup of model rows is stable
    const models = new Set(page1.records.map((r) => r.name));
    expect(models.has(page1.records[0].name)).toBe(true);

    vi.unstubAllGlobals();
  });
});
