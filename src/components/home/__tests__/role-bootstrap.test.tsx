// @vitest-environment jsdom
/**
 * Guards the first-open landing: a Repair Pro must be bounced from the
 * customer home ("/") to /dashboard once the authoritative server role
 * resolves — even when the optimistic first paint briefly carried a stale
 * motorist role. Motorists and guests stay on "/".
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleBootstrap } from "@/components/home/role-bootstrap";

const nav = vi.hoisted(() => {
  const state = { replace: vi.fn(), pathname: "/" };
  return state;
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
}));

const { appState } = vi.hoisted(() => {
  const state: {
    roleReady: boolean;
    accountType: "motorist" | "professional" | null;
  } = { roleReady: true, accountType: null };
  return { appState: state };
});

vi.mock("@/lib/store", () => ({
  useApp: () => ({ roleReady: appState.roleReady, accountType: appState.accountType }),
}));

beforeEach(() => {
  sessionStorage.clear();
  nav.replace.mockClear();
  nav.pathname = "/";
  appState.roleReady = true;
  appState.accountType = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RoleBootstrap first-open landing", () => {
  it("redirects a pro from / to /dashboard once the role is resolved", () => {
    appState.accountType = "professional";
    render(<RoleBootstrap />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("does NOT redirect before the role resolves (null accountType)", () => {
    appState.accountType = null;
    render(<RoleBootstrap />);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("does NOT redirect a motorist", () => {
    appState.accountType = "motorist";
    render(<RoleBootstrap />);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("does NOT redirect from routes other than /", () => {
    nav.pathname = "/jobs/abc";
    appState.accountType = "professional";
    render(<RoleBootstrap />);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("redirects a pro whose role resolves AFTER first paint (stale optimistic motorist)", async () => {
    appState.accountType = "motorist";
    const { rerender } = render(<RoleBootstrap />);
    expect(nav.replace).not.toHaveBeenCalled();

    // Server profile arrives → authoritative role becomes professional.
    await act(async () => {
      appState.accountType = "professional";
    });
    rerender(<RoleBootstrap />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects only once per browser tab (session gate)", async () => {
    appState.accountType = "professional";
    const { rerender } = render(<RoleBootstrap />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("ona-first-open-done")).toBe("1");

    // Later dep changes (roleReady / pathname) must NOT re-bounce the tab.
    await act(async () => {
      appState.roleReady = true;
    });
    rerender(<RoleBootstrap />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });
});
