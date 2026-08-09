import { apiOk } from "@/lib/server/api-json";
import { loadAppConfig } from "@/lib/server/app-config-server";

export const runtime = "nodejs";
/** Public flags change rarely — allow short edge/browser cache (no secrets). */
export const revalidate = 120;

/**
 * Public (unauthenticated) app config for the Ona frontend.
 * No secrets — only behaviour/content flags controlled by Super Admin.
 */
export async function GET() {
  const config = await loadAppConfig();
  return apiOk(
    {
      config,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      },
    }
  );
}
