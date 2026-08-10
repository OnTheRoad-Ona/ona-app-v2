import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  listVehicleMakes,
  listVehicleModels,
  listVehicleTypes,
  listVehicleYears,
} from "@/lib/server/shop/garage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public cascading vehicle catalog (NHTSA-backed rows in Ona DB).
 * GET ?level=types
 * GET ?level=makes&type=&q=
 * GET ?level=models&makeId=
 * GET ?level=years&modelId=
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const level = sp.get("level") || "types";
    if (level === "types") {
      const types = await listVehicleTypes();
      return apiOk({ types });
    }
    if (level === "makes") {
      const makes = await listVehicleMakes(
        sp.get("type") || undefined,
        sp.get("q") || undefined
      );
      return apiOk({ makes });
    }
    if (level === "models") {
      const makeId = sp.get("makeId");
      if (!makeId) return apiFail("makeId required", 400);
      const models = await listVehicleModels(makeId, sp.get("q") || undefined);
      return apiOk({ models });
    }
    if (level === "years") {
      const modelId = sp.get("modelId");
      if (!modelId) return apiFail("modelId required", 400);
      const years = await listVehicleYears(modelId);
      return apiOk({ years });
    }
    return apiFail("Invalid level", 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Catalog failed";
    return apiFail(msg, 500);
  }
}