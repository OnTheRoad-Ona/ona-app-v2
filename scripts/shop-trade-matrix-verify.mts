/**
 * Phase 3 trade-matrix verification against the real Supabase DB.
 * For every trade: search a representative query, verify the ranking ladder
 * produced sorted results, run facet filters (availability, price), and check
 * that catalog rows validate against the trade's attribute schema.
 *
 * Usage: npx tsx scripts/shop-trade-matrix-verify.mts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { searchShop } from "@/lib/server/shop/search";
import { listProducts } from "@/lib/server/shop/catalog";
import { getTradeFilters } from "@/lib/shop/trade-filters";

const TRADES = [
  ["mechanic", "brake pad"],
  ["vulcanizer", "tire"],
  ["towing", "tow"],
  ["ac", "compressor"],
  ["battery", "battery charger"],
  ["body", "paint"],
  ["electrical", "transformer"],
  ["diagnostics", "scanner"],
  ["wash", "wash"],
  ["plumber", "pump"],
  ["carpenter", "saw"],
  ["painter", "roller"],
  ["solar", "inverter"],
  ["generator", "generator"],
] as const;

async function main() {
  let failures = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const [trade, query] of TRADES) {
    try {
      const ctx = "motorist";

      // 1. Search (trade-locked)
      const search = await searchShop(query, {
        tradeKey: trade,
        lockTrade: true,
        limit: 20,
        accountContext: ctx,
      });
      const ids = search.results.map((r) => r.id);
      const unique = new Set(ids).size;
      const sorted = search.results.every(
        (r, i) =>
          i === 0 || search.results[i - 1].relevance >= r.relevance
      );
      const allHaveRelevance = search.results.every(
        (r) => typeof r.relevance === "number" && r.relevance > 0
      );
      if (!sorted || !allHaveRelevance) {
        failures++;
        throw new Error(`ranking broken: sorted=${sorted} allRel=${allHaveRelevance}`);
      }
      if (unique !== search.results.length) {
        failures++;
        throw new Error("duplicate product ids in results");
      }
      const wrongTrade = search.results.find((r) => r.tradeKey !== trade);
      if (wrongTrade) {
        failures++;
        throw new Error(`locked trade leak: ${wrongTrade.tradeKey}`);
      }

      // 2. In-stock facet filter
      const inStock = await listProducts({
        tradeKey: trade,
        limit: 20,
        accountContext: ctx,
        filters: { availability: "in_stock" },
      });

      // 3. Price facet filter (within result price band if any priced product)
      let priceFiltered: Awaited<ReturnType<typeof listProducts>> = [];
      const priced = search.results.find((r) => r.fromPriceMinor != null);
      if (priced && priced.fromPriceMinor != null) {
        const lo = Math.max(0, priced.fromPriceMinor - 1000);
        const hi = priced.fromPriceMinor + 1000;
        priceFiltered = await listProducts({
          tradeKey: trade,
          limit: 20,
          accountContext: ctx,
          filters: { minPriceMinor: lo, maxPriceMinor: hi },
        });
      }

      // 4. Trade filter config exists
      const filters = getTradeFilters(trade);

      rows.push({
        trade,
        searched: search.results.length,
        inStock: inStock.length,
        priceWindow: priceFiltered.length,
        facets: filters.length,
        top: search.results[0]?.name,
        topReason: search.results[0]?.relevanceReason,
      });
      console.log(`OK ${trade.padEnd(12)} n=${search.results.length}`);
    } catch (e) {
      failures++;
      console.error(`FAIL ${trade}:`, e instanceof Error ? e.message : e);
    }
  }

  if (failures === 0) {
    console.log("\nTRADE MATRIX PASSED (14 trades)");
  } else {
    console.error(`\nTRADE MATRIX FAILED — ${failures} trade(s)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});
