import { describe, expect, it } from "vitest";
import {
  isNonStackNotification,
  isServiceRequestNotification,
  isNotificationDayOpen,
  localDayKey,
} from "@/lib/notifications/stack-rules";
import { groupNotifications, isGroup } from "@/lib/notifications/group";
import type { AppNotification } from "@/lib/notifications/types";

function n(
  partial: Partial<AppNotification> & Pick<AppNotification, "id" | "title">,
): AppNotification {
  return {
    userId: "u1",
    category: "system",
    priority: "normal",
    body: "",
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("service request day open/close", () => {
  it("detects pro + customer service request types", () => {
    expect(
      isServiceRequestNotification(
        n({
          id: "1",
          title: "Service Request",
          category: "requests",
          actionType: "accept_request",
          groupKey: "service-request-x",
        }),
      ),
    ).toBe(true);
    expect(
      isServiceRequestNotification(
        n({
          id: "2",
          title: "Mechanic accepted",
          body: "Tunde accepted your request",
          category: "requests",
        }),
      ),
    ).toBe(true);
  });

  it("same local day → not stacked; prior day → stackable", () => {
    const now = new Date(2026, 7, 8, 15, 0, 0); // Aug 8 local
    const today = n({
      id: "t",
      title: "Service Request",
      category: "requests",
      actionType: "accept_request",
      createdAt: new Date(2026, 7, 8, 10, 0, 0).toISOString(),
    });
    const yesterday = n({
      id: "y",
      title: "Service Request",
      category: "requests",
      actionType: "accept_request",
      createdAt: new Date(2026, 7, 7, 18, 0, 0).toISOString(),
    });
    expect(isNotificationDayOpen(today.createdAt, now)).toBe(true);
    expect(isNonStackNotification(today, now)).toBe(true);
    expect(isNotificationDayOpen(yesterday.createdAt, now)).toBe(false);
    expect(isNonStackNotification(yesterday, now)).toBe(false);
  });

  it("groups closed-day service requests into one stack for that day only", () => {
    const now = new Date(2026, 7, 8, 12, 0, 0);
    const list = [
      n({
        id: "today1",
        title: "Service Request",
        category: "requests",
        actionType: "accept_request",
        createdAt: new Date(2026, 7, 8, 11, 0, 0).toISOString(),
      }),
      n({
        id: "y1",
        title: "Service Request",
        category: "requests",
        actionType: "accept_request",
        createdAt: new Date(2026, 7, 7, 9, 0, 0).toISOString(),
      }),
      n({
        id: "y2",
        title: "Pro accepted",
        body: "accepted your request",
        category: "requests",
        createdAt: new Date(2026, 7, 7, 14, 0, 0).toISOString(),
      }),
    ];
    const grouped = groupNotifications(list, now);
    const singles = grouped.filter((x) => !isGroup(x)) as AppNotification[];
    const groups = grouped.filter(isGroup);
    expect(singles.map((s) => s.id)).toContain("today1");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(
      `service_req:${localDayKey(new Date(2026, 7, 7))}`,
    );
    expect(groups[0].items.map((i) => i.id).sort()).toEqual(["y1", "y2"]);
  });

  it("lists all stacks first, then non-stack full rows newest-first", () => {
    const now = new Date(2026, 7, 8, 18, 0, 0);
    const list = [
      n({
        id: "chat-new",
        title: "New message",
        category: "messages",
        actionType: "open_chat",
        createdAt: new Date(2026, 7, 8, 17, 0, 0).toISOString(),
      }),
      n({
        id: "sys-old",
        title: "System A",
        category: "system",
        createdAt: new Date(2026, 7, 6, 10, 0, 0).toISOString(),
      }),
      n({
        id: "sys-new",
        title: "System B",
        category: "system",
        createdAt: new Date(2026, 7, 7, 10, 0, 0).toISOString(),
      }),
      n({
        id: "pay",
        title: "Payment released",
        category: "payments",
        actionType: "view_payment",
        createdAt: new Date(2026, 7, 8, 16, 0, 0).toISOString(),
      }),
    ];
    const grouped = groupNotifications(list, now);
    // Stack section first (system bucket as one group), then chat + pay full rows
    const groups = grouped.filter(isGroup);
    const fullIds = grouped
      .filter((x) => !isGroup(x))
      .map((x) => (x as AppNotification).id);

    expect(groups.length).toBeGreaterThanOrEqual(1);
    // First item(s) are stack section system group or single stackables before full rows
    const firstFullIdx = grouped.findIndex(
      (x) => !isGroup(x) && isNonStackNotification(x as AppNotification, now),
    );
    const lastStackIdx = grouped.reduce((acc, x, i) => {
      if (isGroup(x)) return i;
      if (!isNonStackNotification(x as AppNotification, now)) return i;
      return acc;
    }, -1);
    expect(lastStackIdx).toBeLessThan(firstFullIdx);
    // Full rows newest first: chat-new then pay
    expect(fullIds.filter((id) => id === "chat-new" || id === "pay")).toEqual([
      "chat-new",
      "pay",
    ]);
  });
});
