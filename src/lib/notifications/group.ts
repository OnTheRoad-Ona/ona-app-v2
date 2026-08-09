import type { AppNotification } from "@/lib/notifications/types";
import {
  isNonStackNotification,
  isServiceRequestNotification,
  serviceRequestDayStackKey,
  serviceRequestDayStackLabel,
} from "@/lib/notifications/stack-rules";

export type NotificationGroup = {
  key: string;
  items: AppNotification[];
  head: AppNotification;
  unread: number;
  typeLabel: string;
};

/**
 * Categorize a stackable notification into a pile type (X/Twitter style).
 * Closed-day service requests group per local calendar day only.
 */
function notificationTypeKey(n: AppNotification): string {
  const dayKey = serviceRequestDayStackKey(n);
  // Past-day service requests (stackable) → one stack per that day
  if (dayKey && !isNonStackNotification(n)) {
    return dayKey;
  }
  const gk = n.groupKey || "";
  if (gk.startsWith("payout-released")) return "payout_released";
  if (gk.startsWith("payout-pending")) return "payout_processing";
  if (gk.startsWith("job-complete")) return "confirm_release";
  if (gk.startsWith("pay-cancel")) return "booking_cancelled";
  if (n.category === "system") return "system";
  if (n.category === "requests" && !isServiceRequestNotification(n)) {
    return "requests";
  }
  if (n.category === "requests") return "requests";
  return "other";
}

function typeLabel(key: string): string {
  if (key.startsWith("service_req:")) {
    return serviceRequestDayStackLabel(key);
  }
  switch (key) {
    case "payout_released":
      return "Payment Released";
    case "payout_processing":
      return "Payout Processing";
    case "confirm_release":
      return "Release Payment";
    case "booking_cancelled":
      return "Cancelled";
    case "requests":
      return "Requests";
    case "system":
      return "System";
    default:
      return "Updates";
  }
}

/**
 * Group notifications for center + same rules as toasts.
 *
 * Order (user-confirmed):
 *   1) All stacked groups / stackable singles first (newest head first)
 *   2) Then non-stacked full rows (chat/call/pay/open-day requests), newest first
 *
 * Never interleave stacks with full rows by timestamp.
 */
export function groupNotifications(
  list: AppNotification[],
  now: Date = new Date()
): (AppNotification | NotificationGroup)[] {
  const sorted = [...list].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const stackable: AppNotification[] = [];
  const nonStack: AppNotification[] = [];
  for (const n of sorted) {
    if (isNonStackNotification(n, now)) nonStack.push(n);
    else stackable.push(n);
  }

  const buckets = new Map<string, AppNotification[]>();
  const order: string[] = [];
  for (const n of stackable) {
    const key = notificationTypeKey(n);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(n);
  }

  // Within the stack section: newest bucket head first, then priority
  order.sort((a, b) => {
    const aItems = buckets.get(a)!;
    const bItems = buckets.get(b)!;
    const aMaxPrio = Math.max(
      ...aItems.map((i) =>
        i.priority === "critical" ? 3 : i.priority === "high" ? 2 : 1
      )
    );
    const bMaxPrio = Math.max(
      ...bItems.map((i) =>
        i.priority === "critical" ? 3 : i.priority === "high" ? 2 : 1
      )
    );
    const aAt = new Date(aItems[0].createdAt).getTime();
    const bAt = new Date(bItems[0].createdAt).getTime();
    if (aAt !== bAt) return bAt - aAt;
    return bMaxPrio - aMaxPrio;
  });

  const stackedSection: (AppNotification | NotificationGroup)[] = [];
  for (const key of order) {
    const items = buckets.get(key) || [];
    if (items.length === 1) {
      stackedSection.push(items[0]);
    } else {
      stackedSection.push({
        key,
        items,
        head: items[0],
        unread: items.filter((i) => !i.readAt).length,
        typeLabel: typeLabel(key),
      });
    }
  }

  // nonStack already newest-first from `sorted` iteration order
  // (we pushed in sorted order). Re-sort to be explicit.
  const fullRows = [...nonStack].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return [...stackedSection, ...fullRows];
}

export function isGroup(
  x: AppNotification | NotificationGroup
): x is NotificationGroup {
  return "items" in x && Array.isArray((x as NotificationGroup).items);
}
