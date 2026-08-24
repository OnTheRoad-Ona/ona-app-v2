/**
 * ONA Shop source connector contract (Phase 2).
 *
 * A connector fetches records from a data source (API/feed/demo), reports its
 * license/status, and yields normalized staging records. It never fabricates
 * fitment claims vehicle fitment is only attached from real source data.
 */

export type StagedRecord = {
  externalId?: string;
  externalCategory?: string;
  tradeKey?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  brand?: { slug?: string; name?: string } | string | null;
  sku?: string;
  mpn?: string;
  oemNumber?: string;
  priceMinor?: number;
  status?: string;
  attributes?: Record<string, unknown>;
  keywords?: string[];
  /** Raw source payload, stored verbatim for provenance/audit. */
  raw: Record<string, unknown>;
};

export type ConnectorRunReport = {
  discovered: number;
  imported: number;
  updated: number;
  rejected: number;
  errors: string[];
};

export interface CatalogConnector {
  readonly code: string;
  readonly name: string;
  /** Source license text surfaced to admin/ops. */
  readonly license: string;
  readonly licenseUrl: string | null;
  readonly homepageUrl: string | null;
  readonly sourceCode: string;
  /** List records, batched/paginated to stay network-resilient. */
  fetchRecords(opts?: {
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  }): Promise<{ records: StagedRecord[]; hasMore: boolean; total?: number }>;
}

export type ConnectorRegistry = Record<string, () => Promise<CatalogConnector>>;

export async function loadConnector(
  code: string,
  registry: ConnectorRegistry,
): Promise<CatalogConnector | null> {
  const loader = registry[code];
  if (!loader) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}
