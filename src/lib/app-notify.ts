/**
 * Browser notifications + vibration for calls and chat.
 * Best-effort: works when the site is open (foreground or background tab).
 * True closed-app push would need FCM/APNs — not required here.
 */

let permissionAsked = false;

export async function ensureNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  if (permissionAsked) return Notification.permission;
  permissionAsked = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function canNotify(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );
}

export type AppNotifyOpts = {
  title: string;
  body: string;
  tag?: string;
  /** Relative path e.g. /messages/uuid */
  href?: string;
  requireInteraction?: boolean;
};

/**
 * Show a system notification. No-op if permission missing.
 * Click focuses the window and optionally navigates.
 */
export function showAppNotification(opts: AppNotifyOpts): void {
  if (!canNotify()) return;
  try {
    // Avoid stacking identical tags
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag || "ona",
      requireInteraction: opts.requireInteraction ?? false,
      silent: false,
    });
    n.onclick = () => {
      try {
        window.focus();
        if (opts.href) {
          // Soft navigate if same origin SPA
          const path = opts.href.startsWith("/")
            ? opts.href
            : `/${opts.href}`;
          if (window.location.pathname !== path) {
            window.location.href = path;
          }
        }
      } catch {
        /* */
      }
      n.close();
    };
    // Auto-close non-critical after 66s (match in-app request / toast banners)
    if (!opts.requireInteraction) {
      window.setTimeout(() => {
        try {
          n.close();
        } catch {
          /* */
        }
      }, 66_000);
    }
  } catch {
    /* Safari private / unsupported */
  }
}

export function vibrateCallPattern(): void {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
  } catch {
    /* */
  }
}

export function vibrateMessagePattern(): void {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([80, 40, 80]);
    }
  } catch {
    /* */
  }
}

/** Wait for ICE gathering or timeout (hybrid trickle + batch). */
export function waitIceGathering(
  pc: RTCPeerConnection,
  timeoutMs = 1800
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        pc.removeEventListener("icegatheringstatechange", onState);
      } catch {
        /* */
      }
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icegatheringstatechange", onState);
    window.setTimeout(finish, timeoutMs);
  });
}
