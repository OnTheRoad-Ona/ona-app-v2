/**
 * Server-side Web Push (VAPID). Routes a cancellation / job update to every
 * registered OS push subscription for a user so the message arrives even when
 * the app is closed or the tab is hidden — the real-time "server prompt" that
 * does not depend on the app being in the foreground.
 */

import webpush from "web-push";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getVapidPrivateKey,
  getVapidPublicKey,
  getVapidSubject,
  isVapidConfigured,
} from "@/lib/push/env";

export type PushPayload = {
  title: string;
  body: string;
  /** Deep link opened when the OS notification is tapped. */
  url?: string;
  tag?: string;
  icon?: string;
};

let vapidReady = false;

function ensureVapid(): boolean {
  if (vapidReady || !isVapidConfigured()) return vapidReady && isVapidConfigured();
  webpush.setVapidDetails(
    getVapidSubject(),
    getVapidPublicKey(),
    getVapidPrivateKey()
  );
  vapidReady = true;
  return true;
}

/**
 * Best-effort push to every subscription of a user. Dead subscriptions
 * (410 Gone / 404) are pruned so we never hammer a stale endpoint.
 * Never throws — the caller must not let notification failures block the
 * underlying job transition.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!ensureVapid()) return;
  let sb;
  try {
    sb = createServiceSupabase();
    if (!sb) return;
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", userId);
    if (error || !data || data.length === 0) return;

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "",
      tag: payload.tag || "",
      icon: payload.icon || "",
    });

    for (const row of data) {
      const endpoint = String(row.endpoint);
      try {
        await webpush.sendNotification(
          {
            endpoint,
            keys: {
              p256dh: String(row.p256dh),
              auth: String(row.auth),
            },
          },
          message,
          { TTL: 600 }
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          try {
            await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
          } catch {
            /* cleanup best-effort */
          }
        }
      }
    }
  } catch {
    /* push is best-effort — never block the job transition */
  }
}