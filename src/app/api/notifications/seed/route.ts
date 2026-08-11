import { apiFail } from "@/lib/server/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/seed
 * DISABLED — demo sample seeding removed; the endpoint now refuses to run.
 */
export async function POST() {
  return apiFail("Demo notification seeding is disabled", 404, "seeder_disabled");
}
