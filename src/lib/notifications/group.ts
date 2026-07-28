import type { AppNotification } from "@/lib/notifications/types";

export type NotificationGroup = {
  key: string;
  items: AppNotification[];
  /** Newest item drives title/body */
  head: AppNotification;
  unread: number;
};

/**
 * Stack key: explicit groupKey, else same title + category + job
 * (Twitter-style: related updates collapse into one cascade).
 */
function stackKey(n: AppNotification): string {
  if (n.groupKey) return `gk:${n.groupKey}`;
  const title = (n.title || "").trim().toLowerCase().replace(/\s+/g, " ");
  const cat = n.category || "system";
  const job = n.jobId || "";
  return `st:${cat}|${job}|${title}`;
}

/**
 * Smart grouping: same thread collapses into one expandable cascade.
 * Newest first; click expands stacked updates.
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
    const key = stackKey(n);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(n);
  }

  const out: (AppNotification | NotificationGroup)[] = [];
  for (const key of order) {
    const items = buckets.get(key) || [];
    if (items.length === 1) {
      out.push(items[0]);
    } else if (items.length > 1) {
      out.push({
        key,
        items,
        head: items[0],
        unread: items.filter((i) => !i.readAt).length,
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
