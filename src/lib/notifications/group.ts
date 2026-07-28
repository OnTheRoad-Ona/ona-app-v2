import type { AppNotification } from "@/lib/notifications/types";

export type NotificationGroup = {
  key: string;
  items: AppNotification[];
  head: AppNotification;
  unread: number;
  typeLabel: string;
};

/**
 * Categorize a notification into a stack type so related
 * notifications group together across all jobs (X/Twitter style).
 */
function notificationTypeKey(n: AppNotification): string {
  const gk = n.groupKey || "";
  if (gk.startsWith("payout-released")) return "payout_released";
  if (gk.startsWith("payout-pending")) return "payout_processing";
  if (gk.startsWith("job-complete")) return "confirm_release";
  if (gk.startsWith("pay-cancel")) return "booking_cancelled";
  if (n.category === "messages") return "messages";
  if (n.category === "requests") return "requests";
  if (n.category === "system") return "system";
  return "other";
}

function typeLabel(key: string): string {
  switch (key) {
    case "payout_released":
      return "Payment Released";
    case "payout_processing":
      return "Payout Processing";
    case "confirm_release":
      return "Release Payment";
    case "booking_cancelled":
      return "Cancelled";
    case "messages":
      return "Messages";
    case "requests":
      return "Requests";
    case "system":
      return "System";
    default:
      return "Updates";
  }
}

/**
 * Group notifications by TYPE across all jobs (not per-job).
 * Newest first within each stack; groups ordered by highest
 * unread priority then newest.
 */
export function groupNotifications(
  list: AppNotification[]
): (AppNotification | NotificationGroup)[] {
  const buckets = new Map<string, AppNotification[]>();
  const order: string[] = [];

  const sorted = [...list].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const n of sorted) {
    const key = notificationTypeKey(n);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(n);
  }

  // Sort groups: critical/high priority first, then by newest head
  order.sort((a, b) => {
    const aItems = buckets.get(a)!;
    const bItems = buckets.get(b)!;
    const aMaxPrio = Math.max(
      ...aItems.map((i) => (i.priority === "critical" ? 3 : i.priority === "high" ? 2 : 1))
    );
    const bMaxPrio = Math.max(
      ...bItems.map((i) => (i.priority === "critical" ? 3 : i.priority === "high" ? 2 : 1))
    );
    if (aMaxPrio !== bMaxPrio) return bMaxPrio - aMaxPrio;
    return (
      new Date(bItems[0].createdAt).getTime() -
      new Date(aItems[0].createdAt).getTime()
    );
  });

  const out: (AppNotification | NotificationGroup)[] = [];
  for (const key of order) {
    const items = buckets.get(key) || [];
    if (items.length === 1) {
      out.push(items[0]);
    } else {
      out.push({
        key,
        items,
        head: items[0],
        unread: items.filter((i) => !i.readAt).length,
        typeLabel: typeLabel(key),
      });
    }
  }
  return out;
}

export function isGroup(
  x: AppNotification | NotificationGroup
): x is NotificationGroup {
  return "items" in x && Array.isArray((x as NotificationGroup).items);
}
