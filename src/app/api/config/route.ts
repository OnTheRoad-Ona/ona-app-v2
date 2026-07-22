import { apiOk } from "@/lib/server/api-json";
import { loadAppConfig } from "@/lib/server/app-config-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public (unauthenticated) app config for the Ona frontend.
 * No secrets — only behaviour/content flags controlled by Super Admin.
 */
export async function GET() {
  const config = await loadAppConfig();
  return apiOk({
    config,
    fetchedAt: new Date().toISOString(),
  });
}
