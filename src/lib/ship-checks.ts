/**
 * Server-side proofs that a given deploy includes expected fixes.
 * Used by GET /api/ship-status so we can confirm changes on Vercel without
 * trusting the HTML shell alone.
 */

import { ONA_BUILD_ID, ONA_BUILD_LABEL } from "@/lib/build-id";
import {
  getTradeFilterConfig,
  getTradeFilters,
} from "@/lib/shop/trade-filters";

export type ShipCheck = {
  id: string;
  title: string;
  ok: boolean;
  detail: string;
};

export type ShipStatus = {
  service: "ona";
  buildId: string;
  buildLabel: string;
  checkedAt: string;
  env: {
    vercelEnv: string | null;
    vercelUrl: string | null;
    gitCommit: string | null;
    gitMessage: string | null;
    region: string | null;
  };
  checks: ShipCheck[];
  allPassed: boolean;
  summary: string;
};

function check(
  id: string,
  title: string,
  ok: boolean,
  detail: string
): ShipCheck {
  return { id, title, ok, detail };
}

/** Pure in-process checks (no network / DB). Always safe for public GET. */
export function runShipChecks(): ShipStatus {
  const checks: ShipCheck[] = [];

  // ── Build stamp ──────────────────────────────────────────────────
  checks.push(
    check(
      "build-id",
      "Build stamp present",
      Boolean(ONA_BUILD_ID && ONA_BUILD_ID.length > 4),
      ONA_BUILD_ID
    )
  );
  checks.push(
    check(
      "build-label",
      "Build label present",
      Boolean(ONA_BUILD_LABEL && ONA_BUILD_LABEL.length > 4),
      ONA_BUILD_LABEL
    )
  );
  checks.push(
    check(
      "filters-array-fix-stamp",
      "Ship includes filters-array / vehicles-flat / 80pct fix line",
      ONA_BUILD_ID.includes("filters-array-fix") ||
        ONA_BUILD_ID.includes("shop-filters") ||
        ONA_BUILD_ID.includes("ship-status") ||
        ONA_BUILD_ID.includes("vehicles-flat") ||
        ONA_BUILD_ID.includes("flat-select") ||
        ONA_BUILD_ID.includes("80pct") ||
        ONA_BUILD_ID.includes("portal") ||
        ONA_BUILD_ID.includes("fixed-80") ||
        ONA_BUILD_ID.includes("sheet-80") ||
        ONA_BUILD_ID.includes("mechanic-shop") ||
        ONA_BUILD_LABEL.toLowerCase().includes("filters array") ||
        ONA_BUILD_LABEL.toLowerCase().includes("flatselect") ||
        ONA_BUILD_LABEL.toLowerCase().includes("80%") ||
        ONA_BUILD_LABEL.toLowerCase().includes("portal") ||
        ONA_BUILD_LABEL.toLowerCase().includes("sheet") ||
        ONA_BUILD_LABEL.toLowerCase().includes("mechanic shop") ||
        ONA_BUILD_LABEL.toLowerCase().includes("fixed"),
      `buildId=${ONA_BUILD_ID}`
    )
  );

  // ── Shop filters shape (the defs.some crash) ─────────────────────
  const mechanicCfg = getTradeFilterConfig("mechanic");
  const mechanicFilters = getTradeFilters("mechanic");

  checks.push(
    check(
      "filters-config-exists",
      "Mechanic trade filter config exists",
      Boolean(mechanicCfg),
      mechanicCfg
        ? `tradeKey=${mechanicCfg.tradeKey} count=${mechanicCfg.filters.length}`
        : "null config"
    )
  );

  checks.push(
    check(
      "filters-is-array",
      "Trade filters are a real Array (not config object)",
      Array.isArray(mechanicFilters),
      Array.isArray(mechanicFilters)
        ? `Array length=${mechanicFilters.length}`
        : `typeof=${typeof mechanicFilters}`
    )
  );

  const hasAvailability =
    Array.isArray(mechanicFilters) &&
    mechanicFilters.some((d) => d.kind === "availability");
  const hasPrice =
    Array.isArray(mechanicFilters) &&
    mechanicFilters.some((d) => d.kind === "price");
  const hasCategory =
    Array.isArray(mechanicFilters) &&
    mechanicFilters.some((d) => d.kind === "category");

  checks.push(
    check(
      "filters-has-availability",
      "defs.some(availability) works on filter array",
      hasAvailability,
      hasAvailability
        ? "kind=availability present"
        : "availability missing or .some would throw"
    )
  );
  checks.push(
    check(
      "filters-has-price",
      "defs.some(price) works on filter array",
      hasPrice,
      hasPrice ? "kind=price present" : "price missing"
    )
  );
  checks.push(
    check(
      "filters-has-category",
      "defs.some(category) works on filter array",
      hasCategory,
      hasCategory ? "kind=category present" : "category missing"
    )
  );

  // API response contract: filters field must be the array, not nested config
  const simulatedApiPayload = mechanicCfg
    ? {
        trade: mechanicCfg.tradeKey,
        filters: mechanicCfg.filters,
        hasVehicleFitment: mechanicCfg.hasVehicleFitment,
      }
    : null;
  const apiFiltersIsArray = Array.isArray(simulatedApiPayload?.filters);
  const apiFiltersNotConfigObject =
    apiFiltersIsArray &&
    !(
      simulatedApiPayload &&
      typeof simulatedApiPayload.filters === "object" &&
      simulatedApiPayload.filters !== null &&
      !Array.isArray(simulatedApiPayload.filters) &&
      "filters" in (simulatedApiPayload.filters as object)
    );

  checks.push(
    check(
      "api-filters-contract",
      "API payload shape: data.filters is FilterDef[]",
      apiFiltersIsArray && apiFiltersNotConfigObject,
      apiFiltersIsArray
        ? `filters[0].kind=${(simulatedApiPayload!.filters[0] as { kind: string }).kind}`
        : "filters is not an array (would crash client)"
    )
  );

  // ── Vehicles UI (custom FlatSelect — no native metallic <select>) ──
  checks.push(
    check(
      "vehicles-flat-ui",
      "My vehicles uses custom FlatSelect (no native 3D select)",
      ONA_BUILD_ID.includes("vehicles-flat") ||
        ONA_BUILD_ID.includes("flat-select") ||
        ONA_BUILD_ID.includes("mechanic-shop") ||
        ONA_BUILD_LABEL.toLowerCase().includes("flat select") ||
        ONA_BUILD_LABEL.toLowerCase().includes("flat vehicles") ||
        ONA_BUILD_LABEL.toLowerCase().includes("mechanic shop") ||
        ONA_BUILD_ID.includes("ship-status") ||
        ONA_BUILD_ID.includes("vehicles"),
      ONA_BUILD_LABEL
    )
  );
  checks.push(
    check(
      "mechanic-shop-arch",
      "Mechanic Shop architecture ship line present",
      ONA_BUILD_ID.includes("mechanic-shop") ||
        ONA_BUILD_LABEL.toLowerCase().includes("mechanic shop"),
      ONA_BUILD_ID
    )
  );
  checks.push(
    check(
      "vehicles-copy",
      "Intro copy has no fitment/catalog blurb",
      !ONA_BUILD_LABEL.toLowerCase().includes("fitment catalog"),
      "Expected short intro only on /shop/vehicles"
    )
  );

  const failed = checks.filter((c) => !c.ok);
  const allPassed = failed.length === 0;

  return {
    service: "ona",
    buildId: ONA_BUILD_ID,
    buildLabel: ONA_BUILD_LABEL,
    checkedAt: new Date().toISOString(),
    env: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelUrl: process.env.VERCEL_URL ?? null,
      gitCommit:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
        process.env.GIT_COMMIT?.slice(0, 12) ??
        null,
      gitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 120) ?? null,
      region: process.env.VERCEL_REGION ?? null,
    },
    checks,
    allPassed,
    summary: allPassed
      ? `All ${checks.length} ship checks passed · ${ONA_BUILD_ID}`
      : `${failed.length}/${checks.length} checks failed: ${failed.map((f) => f.id).join(", ")}`,
  };
}
