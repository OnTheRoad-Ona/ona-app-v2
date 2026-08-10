import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { getAllPartsForVehicle } from "@/lib/server/shop/all-parts";
import { getDefaultVehicle, listUserVehicles } from "@/lib/server/shop/garage";
import { resolveAccountContext } from "@/lib/server/shop/catalog";
import { requireUser } from "@/lib/server/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ALL PARTS for active (or specified) garage vehicle.
 * Guest: pass makeName/modelName/year query (session-style, no save).
 * Signed-in: uses garage default unless vehicleId set.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tradeKey = sp.get("trade") || "mechanic";
    const categoryId = sp.get("categoryId") || undefined;

    let vehicle: {
      makeId: string | null;
      modelId: string | null;
      makeName: string;
      modelName: string;
      year: number | null;
    } | null = null;

    const auth = await requireUser(req);
    if (auth.ok) {
      const vehicleId = sp.get("vehicleId");
      if (vehicleId) {
        const list = await listUserVehicles(auth.userId);
        const v = list.find((x) => x.id === vehicleId);
        if (v) {
          vehicle = {
            makeId: v.makeId,
            modelId: v.modelId,
            makeName: v.makeName,
            modelName: v.modelName,
            year: v.year,
          };
        }
      }
      if (!vehicle) {
        const d = await getDefaultVehicle(auth.userId);
        if (d) {
          vehicle = {
            makeId: d.makeId,
            modelId: d.modelId,
            makeName: d.makeName,
            modelName: d.modelName,
            year: d.year,
          };
        }
      }
    }

    // Ad-hoc vehicle from query (browse without garage save)
    if (!vehicle) {
      const makeName = sp.get("makeName")?.trim();
      const modelName = sp.get("modelName")?.trim();
      if (makeName && modelName) {
        vehicle = {
          makeId: sp.get("makeId"),
          modelId: sp.get("modelId"),
          makeName,
          modelName,
          year: sp.get("year") ? Number(sp.get("year")) : null,
        };
      }
    }

    if (!vehicle) {
      return apiFail(
        "Select a vehicle first (My vehicles or make/model).",
        400,
        "VEHICLE_REQUIRED"
      );
    }

    const tree = await getAllPartsForVehicle({
      tradeKey,
      vehicle,
      categoryId,
      limit: 48,
      accountContext: await resolveAccountContext(req),
    });
    return apiOk(tree);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "All parts failed";
    return apiFail(msg, 500);
  }
}
