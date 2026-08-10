/**
 * Ona Vulcanizer Shop catalog connector (real catalogue).
 * Streams the ETRTO-grounded vulcanizer catalogue through the standard import
 * pipeline so it behaves exactly like a real source — full
 * data-source/job/staging/validation/change-log provenance.
 */

import { VULCANIZER_PRODUCTS } from "@/lib/shop/vulcanizer-catalog";
import type {
  CatalogConnector,
  StagedRecord,
} from "@/lib/server/shop/connectors/types";
import { checksum } from "@/lib/server/shop/normalize";

const PAGE_SIZE = 25;

export class VulcanizerCatalogConnector implements CatalogConnector {
  readonly code = "ona_vulcanizer";
  readonly name = "Ona Vulcanizer Shop Catalogue";
  readonly license = "Ona-curated catalogue grounded in ETRTO standards (public dimensional/load/speed data)";
  readonly licenseUrl = "https://www.etrto.org/";
  readonly homepageUrl = null;
  readonly sourceCode = "ona_vulcanizer";

  async fetchRecords(opts?: {
    page?: number;
    pageSize?: number;
  }): Promise<{ records: StagedRecord[]; hasMore: boolean; total?: number }> {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? PAGE_SIZE;
    const start = (page - 1) * pageSize;
    const records = VULCANIZER_PRODUCTS.slice(
      start,
      start + pageSize
    ).map<StagedRecord>((p) => ({
      externalId: p.id,
      externalCategory: `vulcanizer > ${p.categorySlug}`,
      tradeKey: "vulcanizer",
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
      raw: {
        source: "ona_vulcanizer",
        id: p.id,
        qty: p.qty,
        verificationStatus: p.verificationStatus ?? "pending",
      },
    }));

    return {
      records,
      hasMore: start + records.length < VULCANIZER_PRODUCTS.length,
      total: VULCANIZER_PRODUCTS.length,
    };
  }

  checksumFor(record: StagedRecord): string {
    return checksum(record.raw);
  }
}

export function vulcanizerConnectorCount(): number {
  return VULCANIZER_PRODUCTS.length;
}