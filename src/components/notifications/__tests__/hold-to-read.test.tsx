// @vitest-environment jsdom
/**
 * Hold-to-read: a deliberate 1.5s hover marks a notification read; quick
 * glances and read notifications do nothing.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "@/components/notifications/notification-center";

const hoisted = vi.hoisted(() => {
  const notifications = [
    {
      id: "n-unread",
      category: "payments",
      priority: "normal",
      title: "Payment released",
      body: "₦5,000 released",
      createdAt: new Date().toISOString(),
      readAt: null as string | null,
    },
    {
      id: "n-read",
      category: "messages",
      priority: "normal",
      title: "New message",
      body: "hello",
      createdAt: new Date().toISOString(),
      readAt: new Date().toISOString(),
    },
  ];
  return {
    notifications,
    markRead: vi.fn(async () => {}),
  };
});

vi.mock("@/components/notifications/notification-provider", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/notifications/notification-provider")
  >("@/components/notifications/notification-provider");
  return {
    ...actual,
    useNotifications: () => ({
      notifications: hoisted.notifications,
      centerOpen: true,
      closeCenter: vi.fn(),
      filter: "all",
      setFilter: vi.fn(),
      search: "",
      setSearch: vi.fn(),
      filtered: hoisted.notifications,
      markRead: hoisted.markRead,
      markAllRead: vi.fn(),
      loading: false,
      unreadCount: 1,
    }),
  };
});

vi.mock("@/lib/store", () => ({
  useApp: () => ({ theme: "light", accountType: "motorist" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

describe("NotificationCenter hold-to-read", () => {
  beforeEach(() => {
    hoisted.markRead.mockClear();
    hoisted.notifications[0].readAt = null;
  });

  it("does NOT mark read on quick hover (<1.5s)", () => {
    vi.useFakeTimers();
    render(<NotificationCenter />);
    const row = screen.getByText("Payment released").closest("li");
    expect(row).toBeTruthy();
    fireEvent.mouseEnter(row!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hoisted.markRead).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("marks read after a deliberate 1.5s hover", () => {
    vi.useFakeTimers();
    render(<NotificationCenter />);
    const row = screen.getByText("Payment released").closest("li");
    fireEvent.mouseEnter(row!);
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(hoisted.markRead).toHaveBeenCalledWith(["n-unread"]);
    vi.useRealTimers();
  });

  it("never marks an already-read notification on hover", () => {
    vi.useFakeTimers();
    render(<NotificationCenter />);
    const row = screen.getByText("New message").closest("li");
    fireEvent.mouseEnter(row!);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(hoisted.markRead).not.toHaveBeenCalledWith(["n-read"]);
    vi.useRealTimers();
  });

  it("cancels the hold when the pointer leaves early", () => {
    vi.useFakeTimers();
    render(<NotificationCenter />);
    const row = screen.getByText("Payment released").closest("li");
    fireEvent.mouseEnter(row!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.mouseLeave(row!);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(hoisted.markRead).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
