"use client";

/**
 * Client-side Web Push enrollment. One call per session grants the OS
 * permission prompt the first time it is needed (an incoming request card),
 * registers the service worker, subscribes, and saves the subscription to the
 * server. Everything is best-effort: a failed/paused push setup never blocks
 * the incoming-request flow.
 */

const SETTINGS_STORAGE_KEY = "ona-notification-settings";

let enrolling = false;
let enrolledPromise: Promise<boolean> | null = null;

/** Respect the user's "push" delivery switch in Settings (default on). */
export function isPushDeliveryAllowed(userId?: string | null): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(`${SETTINGS_STORAGE_KEY}:${userId}`);
    if (!raw) return true;
    const p = JSON.parse(raw) as { delivery?: { push?: boolean } };
    return p.delivery?.push !== false;
  } catch {
    return true;
  }
}

export async function enablePushNotifications(
  userId?: string | null,
): Promise<boolean> {
  if (!isPushDeliveryAllowed(userId)) return false;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return false;
  }
  if (Notification.permission === "denied") return false;

  // Only one enrollment in flight (and never repeated after success).
  if (enrolling) return enrolledPromise ?? false;
  if (enrolledPromise) return enrolledPromise;

  enrolling = true;
  enrolledPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (Notification.permission === "default") {
        const granted = await Notification.requestPermission();
        if (granted !== "granted") return false;
      }
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) return false;
      const { publicKey } = (await keyRes.json()) as { publicKey?: string };
      if (!publicKey) return false;

      let sub = await reg.pushManager.getSubscription();
      if (!sub || !sub.endpoint) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
      }
      const raw = sub.toJSON();
      if (!raw.endpoint || !raw.keys) return false;

      const saveRes = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: raw }),
      });
      return saveRes.ok;
    } catch {
      return false;
    } finally {
      enrolling = false;
    }
  })();
  return enrolledPromise;
}
