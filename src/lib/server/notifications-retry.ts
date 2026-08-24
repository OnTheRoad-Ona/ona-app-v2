/**
 * Notification retry queue.
 *
 * Today every channel (push/SMS/email) is fire-once: failures are swallowed
 * and the notification is lost. This module adds a durable queue:
 *   enqueue → cron processes due deliveries → exponential backoff → dead.
 *
 * Channels: push (web-push), sms (Africa's Talking), email (Resend).
 * Max 5 attempts, spaced 5 min → 10 → 20 → 40 min.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const NOTIFICATION_RETRY_MAX = 5;
export const NOTIFICATION_RETRY_BASE_MS = 5 * 60 * 1000;

export function retryDelayMs(attempts: number): number {
  return NOTIFICATION_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1));
}

export type DeliveryChannel = "push" | "sms" | "email";

/**
 * Queue a delivery for (re)processing. Used by send paths when the first
 * attempt fails, so transient network/provider errors never lose a message.
 */
export async function enqueueNotificationDelivery(input: {
  userId: string;
  channel: DeliveryChannel;
  title?: string;
  body?: string;
  payload?: Record<string, unknown>;
  lastError?: string;
  attempts?: number;
}): Promise<{ ok: boolean }> {
  if (!isSupabaseAdminConfigured()) return { ok: false };
  try {
    const sb = createServiceSupabase();
    const attempts = input.attempts ?? 1;
    const status = attempts >= NOTIFICATION_RETRY_MAX ? "dead" : "pending";
    const { error } = await sb.from("notification_deliveries").insert({
      user_id: input.userId,
      channel: input.channel,
      title: input.title ?? "",
      body: input.body ?? "",
      payload: input.payload ?? {},
      attempts,
      max_attempts: NOTIFICATION_RETRY_MAX,
      status,
      next_attempt_at: new Date(
        Date.now() + (status === "dead" ? 0 : retryDelayMs(attempts)),
      ).toISOString(),
      last_error: input.lastError?.slice(0, 500) ?? null,
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/** Process every pending delivery whose next_attempt_at is due. */
export async function processDueNotificationRetries(limit = 30): Promise<{
  attempted: number;
  sent: number;
  dead: number;
}> {
  let attempted = 0;
  let sent = 0;
  let dead = 0;
  if (!isSupabaseAdminConfigured()) return { attempted, sent, dead };
  const sb = createServiceSupabase();

  const { data: due, error } = await sb
    .from("notification_deliveries")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(limit);
  if (error) return { attempted, sent, dead };

  for (const row of due || []) {
    attempted += 1;
    const attempts = Number(row.attempts) || 0;
    let ok = false;
    let errText = "";

    try {
      if (row.channel === "push") {
        const { sendPushToUser } = await import("@/lib/server/push/webpush");
        const result = await sendPushToUser(
          String(row.user_id),
          {
            title: String(row.title || ""),
            body: String(row.body || ""),
            ...(row.payload || {}),
          },
          { noEnqueue: true },
        );
        ok = result.sent > 0;
        errText = result.failures.join("; ").slice(0, 500);
      } else if (row.channel === "sms") {
        const { sendAfricaTalkingSms } = await import(
          "@/lib/server/africastalking"
        );
        const to = String(
          (row.payload as { phone?: string })?.phone || "",
        );
        const result = await sendAfricaTalkingSms({
          to,
          message: String(row.body || ""),
        });
        ok = result.ok;
        errText = result.ok ? "" : result.error;
      } else if (row.channel === "email") {
        const { sendResendEmail } = await import("@/lib/server/resend");
        const p = (row.payload || {}) as {
          to?: string;
          subject?: string;
          html?: string;
        };
        const result = await sendResendEmail({
          to: p.to || "",
          subject: p.subject || String(row.title || ""),
          html: p.html || String(row.body || ""),
        });
        ok = result.ok;
        errText = result.ok ? "" : result.error;
      }
    } catch (e) {
      errText = e instanceof Error ? e.message : "send_failed";
    }

    const nextAttempts = attempts + 1;
    if (ok) {
      sent += 1;
      await sb
        .from("notification_deliveries")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: nextAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } else if (nextAttempts >= NOTIFICATION_RETRY_MAX) {
      dead += 1;
      await sb
        .from("notification_deliveries")
        .update({
          status: "dead",
          attempts: nextAttempts,
          last_error: errText.slice(0, 500) || "max_attempts",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } else {
      await sb
        .from("notification_deliveries")
        .update({
          attempts: nextAttempts,
          next_attempt_at: new Date(
            Date.now() + retryDelayMs(nextAttempts),
          ).toISOString(),
          last_error: errText.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }

  return { attempted, sent, dead };
}
