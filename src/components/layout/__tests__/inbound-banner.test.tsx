// @vitest-environment jsdom
/**
 * Chat popups must only fire for genuinely NEW messages on ACTIVE job chats.
 * Old history never re-pops after a reload or a role switch; closed / historical
 * job chats never pop even when a new message is seen.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboundBanner } from "@/components/layout/inbound-banner";
import type { ChatMessage, MessageThread, ServiceRequest } from "@/lib/types";

const navState = vi.hoisted(() => ({
  pathname: "/",
  router: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => navState.router,
}));

const state = vi.hoisted(() => ({
  messages: [] as MessageThread[],
  requests: [] as ServiceRequest[],
  backendUserId: "u1" as string | null,
  accountType: "professional" as "motorist" | "professional" | null,
  theme: "dark",
  refreshCloudChats: vi.fn(),
  isAuthenticated: true,
}));

vi.mock("@/lib/store", () => ({
  useApp: () => ({
    messages: state.messages,
    requests: state.requests,
    backendUserId: state.backendUserId,
    accountType: state.accountType,
    theme: state.theme,
    refreshCloudChats: state.refreshCloudChats,
    isAuthenticated: state.isAuthenticated,
  }),
}));

const notify = vi.hoisted(() => ({
  canNotify: vi.fn(() => false),
  ensureNotifyPermission: vi.fn(async () => "denied" as NotificationPermission),
  showAppNotification: vi.fn(),
  vibrateMessagePattern: vi.fn(),
}));

vi.mock("@/lib/app-notify", () => ({
  canNotify: notify.canNotify,
  ensureNotifyPermission: notify.ensureNotifyPermission,
  showAppNotification: notify.showAppNotification,
  vibrateMessagePattern: notify.vibrateMessagePattern,
}));

const tone = vi.hoisted(() => ({ playPersonTone: vi.fn() }));

vi.mock("@/lib/sound-tone", () => ({
  playPersonTone: tone.playPersonTone,
}));

function msg(
  id: string,
  sender: ChatMessage["sender"],
  text: string,
  at: string
): ChatMessage {
  return { id, sender, text, at };
}

function thread(
  id: string,
  requestId: string,
  messages: ChatMessage[],
  opts?: { motoristName?: string; technicianName?: string }
): MessageThread {
  return {
    id,
    requestId,
    technicianId: "t-1",
    technicianName: opts?.technicianName ?? "Pro Ada",
    motoristName: opts?.motoristName ?? "Chidi",
    serviceType: "mechanic" as MessageThread["serviceType"],
    lastMessage: messages[messages.length - 1]?.text ?? "",
    time: messages[messages.length - 1]?.at ?? "",
    unread: 0,
    photo: "",
    messages,
  };
}

function job(id: string, status: string): ServiceRequest {
  return { id, status } as unknown as ServiceRequest;
}

const ACTIVE = "negotiating";

beforeEach(() => {
  state.messages = [];
  state.requests = [];
  state.backendUserId = "u1";
  state.accountType = "professional";
  navState.pathname = "/";
  notify.canNotify.mockReturnValue(false);
  notify.ensureNotifyPermission.mockResolvedValue("denied");
  notify.showAppNotification.mockClear();
  notify.vibrateMessagePattern.mockClear();
  tone.playPersonTone.mockClear();
});

describe("InboundBanner new-chat popups", () => {
  it("seeds old history silently on first load (reload does not pop)", () => {
    state.requests = [job("r1", ACTIVE)];
    state.messages = [
      thread("th1", "r1", [
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
      ]),
    ];
    const { rerender } = render(<InboundBanner />);
    expect(screen.queryByText("Where are you?")).toBeNull();
    expect(notify.showAppNotification).not.toHaveBeenCalled();
    expect(tone.playPersonTone).not.toHaveBeenCalled();

    // Same data re-fetched (re-ordered) after reload must stay silent.
    state.messages = [
      thread("th2", "r2", [
        msg("mx", "professional", "I'm close", "2026-08-01T08:30:00Z"),
      ]),
      thread("th1", "r1", [
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
      ]),
    ];
    rerender(<InboundBanner />);
    expect(screen.queryByText("Where are you?")).toBeNull();
    expect(screen.queryByText("I'm close")).toBeNull();
    expect(tone.playPersonTone).not.toHaveBeenCalled();
  });

  it("pops ONLY a genuinely new message on an active job chat", () => {
    state.requests = [job("r1", ACTIVE)];
    state.messages = [
      thread("th1", "r1", [
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
      ]),
    ];
    const { rerender } = render(<InboundBanner />);
    expect(screen.queryByText("Where are you?")).toBeNull();

    notify.canNotify.mockReturnValue(true);
    state.messages = [
      thread("th1", "r1", [
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
        msg("m2", "motorist", "I'm close", "2026-08-01T09:01:00Z"),
      ]),
    ];
    rerender(<InboundBanner />);
    expect(tone.playPersonTone).toHaveBeenCalled();
    expect(notify.vibrateMessagePattern).toHaveBeenCalled();
    expect(screen.getByText("I'm close")).toBeTruthy();
    expect(notify.showAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: "I'm close", tag: "msg-th1" })
    );
  });

  it("never pops a new message on a closed job chat (cancelled)", () => {
    state.requests = [job("r1", "cancelled")];
    state.messages = [
      thread("th1", "r1", [
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
      ]),
    ];
    const { rerender } = render(<InboundBanner />);

    state.messages = [
      thread("th1", "r1", [
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
        msg("m2", "motorist", "I'm close", "2026-08-01T09:01:00Z"),
      ]),
    ];
    rerender(<InboundBanner />);
    expect(tone.playPersonTone).not.toHaveBeenCalled();
    expect(screen.queryByText("I'm close")).toBeNull();
    expect(notify.showAppNotification).not.toHaveBeenCalled();
    expect(notify.vibrateMessagePattern).not.toHaveBeenCalled();
  });

  it("never pops a message when the linked job is historical (not in live requests)", () => {
    state.requests = [];
    state.messages = [
      thread("th1", "r-old", [
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
      ]),
    ];
    const { rerender } = render(<InboundBanner />);

    state.messages = [
      thread("th1", "r-old", [
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
        msg("m2", "motorist", "I'm close", "2026-08-01T09:01:00Z"),
      ]),
    ];
    rerender(<InboundBanner />);
    expect(tone.playPersonTone).not.toHaveBeenCalled();
    expect(screen.queryByText("I'm close")).toBeNull();
  });

  it("re-seeds anchors on a role switch so the other role's history never re-pops", () => {
    const shared: ChatMessage[] = [
      msg("m0", "motorist", "please come", "2026-08-01T08:00:00Z"),
    ];
    // Pro role: the motorist's message is inbound → anchored.
    state.requests = [job("r1", ACTIVE)];
    state.accountType = "professional";
    state.messages = [
      thread("th1", "r1", [
        msg("m0", "motorist", "please come", "2026-08-01T08:00:00Z"),
        msg("m1", "motorist", "Where are you?", "2026-08-01T09:00:00Z"),
      ]),
    ];
    const { rerender } = render(<InboundBanner />);
    expect(tone.playPersonTone).not.toHaveBeenCalled();

    // Switch to motorist: now the PRO's older message is "inbound" in the SAME
    // thread — without a role re-seed this would re-pop old history.
    state.accountType = "motorist";
    state.messages = [
      thread("th1", "r1", [
        msg("m0", "motorist", "please come", "2026-08-01T08:00:00Z"),
        msg("p1", "professional", "I'm close", "2026-08-01T08:30:00Z"),
      ]),
    ];
    rerender(<InboundBanner />);
    expect(tone.playPersonTone).not.toHaveBeenCalled();
    expect(screen.queryByText("I'm close")).toBeNull();
    expect(notify.showAppNotification).not.toHaveBeenCalled();
  });
});