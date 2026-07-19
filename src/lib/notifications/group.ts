import type { AppNotification } from "@/lib/notifications/types";

export type NotificationGroup = {
  key: string;
  items: AppNotification[];
  /** Newest item drives title/body */
  head: AppNotification;
  unread: number;
};

/**
 * Smart grouping: same groupKey collapses into one expandable row.
 */
export function groupNotifications(
  list: AppNotification[]
): (AppNotification | NotificationGroup)[] {
  const groups = new Map<string, AppNotification[]>();
  const order: string[] = [];
  const singles: AppNotification[] = [];

  const sorted = [...list].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const n of sorted) {
    if (n.groupKey) {
      if (!groups.has(n.groupKey)) {
        groups.set(n.groupKey, []);
        order.push(`g:${n.groupKey}`);
      }
      groups.get(n.groupKey)!.push(n);
    } else {
      order.push(`s:${n.id}`);
      singles.push(n);
    }
  }

  const singleById = new Map(singles.map((s) => [s.id, s]));
  const out: (AppNotification | NotificationGroup)[] = [];

  for (const key of order) {
    if (key.startsWith("g:")) {
      const gk = key.slice(2);
      const items = groups.get(gk) || [];
      if (items.length === 1) {
        out.push(items[0]);
      } else if (items.length > 1) {
        out.push({
          key: gk,
          items,
          head: items[0],
          unread: items.filter((i) => !i.readAt).length,
        });
      }
    } else {
      const id = key.slice(2);
      const n = singleById.get(id);
      if (n) out.push(n);
    }
  }
  return out;
}

export function isGroup(
  x: AppNotification | NotificationGroup
): x is NotificationGroup {
  return "items" in x && Array.isArray((x as NotificationGroup).items);
}
