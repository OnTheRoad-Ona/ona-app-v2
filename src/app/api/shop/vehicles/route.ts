import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import {
  addUserVehicle,
  deleteUserVehicle,
  getDefaultVehicle,
  listUserVehicles,
  setDefaultVehicle,
} from "@/lib/server/shop/garage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Garage: list + default (H1 signed-in only). */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  try {
    const vehicles = await listUserVehicles(auth.userId);
    const active = await getDefaultVehicle(auth.userId);
    return apiOk({ vehicles, active });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Garage failed";
    if (/does not exist|Could not find the table/i.test(msg)) {
      return apiOk({
        vehicles: [],
        active: null,
        setupRequired: true,
      });
    }
    return apiFail(msg, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      action?: string;
      vehicleId?: string;
      vehicleTypeSlug?: string;
      makeId?: string;
      modelId?: string;
      makeName?: string;
      modelName?: string;
      year?: number;
      engine?: string;
      nickname?: string;
      setDefault?: boolean;
    };

    if (body.action === "set_default" && body.vehicleId) {
      const v = await setDefaultVehicle(auth.userId, body.vehicleId);
      return apiOk({ vehicle: v });
    }
    if (body.action === "delete" && body.vehicleId) {
      await deleteUserVehicle(auth.userId, body.vehicleId);
      return apiOk({ deleted: true });
    }

    if (!body.makeName?.trim() || !body.modelName?.trim()) {
      return apiFail("makeName and modelName required", 400);
    }
    const vehicle = await addUserVehicle(auth.userId, {
      vehicleTypeSlug: body.vehicleTypeSlug,
      makeId: body.makeId,
      modelId: body.modelId,
      makeName: body.makeName,
      modelName: body.modelName,
      year: body.year,
      engine: body.engine,
      nickname: body.nickname,
      setDefault: body.setDefault,
    });
    return apiOk({ vehicle }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed";
    return apiFail(msg, 500);
  }
}
