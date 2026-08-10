/**
 * Ona Demo catalog connector (Phase 2).
 * Streams the synthetic demo catalog (70+ products, 14 trades) through the
 * standard import pipeline so it behaves exactly like a real source.
 */

import { DEMO_PRODUCTS } from "@/lib/shop/demo-catalog";
import type { CatalogConnector, StagedRecord } from "@/lib/server/shop/connectors/types";
import { checksum } from "@/lib/server/shop/normalize";

const PAGE_SIZE = 25;

export class DemoCatalogConnector implements CatalogConnector {
  readonly code = "ona_demo";
  readonly name = "Ona Demo Catalog";
  readonly license = "Ona proprietary demo data — synthetic, non-infringing fixtures";
  readonly licenseUrl = null;
  readonly homepageUrl = null;
  readonly sourceCode = "ona_demo";

  async fetchRecords(opts?: {
    page?: number;
    pageSize?: number;
  }): Promise<{ records: StagedRecord[]; hasMore: boolean; total?: number }> {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? PAGE_SIZE;
    const start = (page - 1) * pageSize;
    const records = DEMO_PRODUCTS.slice(start, start + pageSize).map<StagedRecord>(
      (p) => ({
        externalId: p.id,
        externalCategory: `${p.tradeKey} > ${p.categorySlug}`,
        tradeKey: p.tradeKey,
        name: p.name,
        subtitle: p.subtitle,
        description: p.description,
        brand: p.brand,
        sku: p.sku,
        mpn: p.mpn,
        oemNumber: p.oemNumber,
        priceMinor: p.priceMinor,
        status: p.status,
        attributes: p.attributes,
        keywords: p.keywords,
        raw: { source: "ona_demo", id: p.id, qty: p.qty },
      })
    );

    return {
      records,
      hasMore: start + records.length < DEMO_PRODUCTS.length,
      total: DEMO_PRODUCTS.length,
    };
  }

  checksumFor(record: StagedRecord): string {
    return checksum(record.raw);
  }
}

export function demoConnectorCount(): number {
  return DEMO_PRODUCTS.length;
}
