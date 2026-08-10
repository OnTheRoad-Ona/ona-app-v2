import { apiOk } from "@/lib/server/api-json";
import { runShipChecks } from "@/lib/ship-checks";
import { getTradeFilterConfig } from "@/lib/shop/trade-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ship-status
 *
 * Public deploy proof — no auth. Use this to confirm a Vercel ship really
 * includes expected fixes (build stamp + in-process filter contract checks).
 *
 * Query:
 *   ?trade=mechanic  — also echo live filter array sample for that trade
 *   ?verbose=1       — include full filter list sample
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const trade = searchParams.get("trade") || "mechanic";
  const verbose = searchParams.get("verbose") === "1";

  const status = runShipChecks();
  const config = getTradeFilterConfig(trade);

  const liveFilters = Array.isArray(config?.filters) ? config!.filters : [];
  const sample = {
    trade: config?.tradeKey ?? trade,
    filtersIsArray: Array.isArray(config?.filters),
    filtersCount: liveFilters.length,
    kinds: liveFilters.map((f) => f.kind),
    // Prove .some works (this is what crashed before)
    someAvailability: liveFilters.some((d) => d.kind === "availability"),
    somePrice: liveFilters.some((d) => d.kind === "price"),
    ...(verbose ? { filters: liveFilters } : {}),
  };

  return apiOk(
    {
      ...status,
      liveFilters: sample,
      vehiclesPage: {
        path: "/shop/vehicles",
        markers: {
          pageDataAttr: "data-om-vehicles-page=flat-2d-v2",
          formDataAttr: "data-om-vehicles-form=1",
          flatSelectDataAttr: "data-om-flat-select=1",
          usesNativeSelect: false,
          introCopy: "Pick your vehicle to browse ALL PARTS.",
          removedCopy:
            "with fitment. Free catalog from public vehicle data + Ona products (NGN).",
          style: "solid 2D fields, no border, no metal/glass native select",
        },
      },
      verify: {
        htmlBuildAttr: `data-ona-build="${status.buildId}"`,
        endpoints: {
          this: "/api/ship-status",
          filters: `/api/shop/filters?trade=${encodeURIComponent(trade)}`,
          healthPublic: "/api/health?public=1",
          vehiclesPage: "/shop/vehicles",
        },
        howToConfirm: [
          "curl -s https://ona-mi.vercel.app/api/ship-status | jq '.data | {allPassed,buildId,vehiclesPage}'",
          "curl -s https://ona-mi.vercel.app/api/shop/filters?trade=mechanic | jq '.data.filters | type'",
          "curl -s https://ona-mi.vercel.app | grep data-ona-build",
        ],
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Ona-Build": status.buildId,
        "X-Ona-Ship-Ok": status.allPassed ? "1" : "0",
      },
    }
  );
}
