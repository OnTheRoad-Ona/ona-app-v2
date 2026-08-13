import { apiFail, apiOk } from "@/lib/server/api-json";
import { getVapidPublicKey } from "@/lib/push/env";

export const runtime = "nodejs";

/** The VAPID public key the browser needs to subscribe a service worker. */
export function GET() {
  const key = getVapidPublicKey();
  if (!key) return apiFail("Push not configured", 503);
  return apiOk({ publicKey: key });
}