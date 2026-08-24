"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import {
  isPasswordGatedPath,
  promptSensitivePassword,
  SensitivePasswordHost,
} from "@/components/admin/sensitive-unlock";
import { cn } from "@/lib/utils";
import {
  adminRoleTheme,
  canAccessAdminPathUi,
  navGroupsForRoleUi,
  normalizeAdminRoleUi,
  type AdminRoleUi,
} from "@/lib/admin-role-ui";

/**
 * Control centre navigation.
 * 🔒 routes open a password popup before navigation.
 * Groups filtered by staff role (Super Admin / Care / Support).
 */
const NAV_GROUPS: {
  label: string;
  items: {
    href: string;
    label: string;
    exact?: boolean;
    password?: boolean;
  }[];
}[] = [
  {
    label: "Operations",
    items: [
      { href: "/admin", label: "Dashboard", exact: true },
      { href: "/admin/dispatch", label: "Dispatch board" },
      { href: "/admin/jobs", label: "Live jobs" },
      { href: "/admin/disputes", label: "Disputes & appeals" },
      {
        href: "/admin/payments/control-center",
        label: "Payment Control Center",
      },
      { href: "/admin/shop", label: "Shop orders & delivery" },
      { href: "/admin/security", label: "Security" },
      { href: "/admin/deletion-requests", label: "Deletion Requests" },
      { href: "/admin/credit-control", label: "Credit Control" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/motorists", label: "Customers" },
      { href: "/admin/pros", label: "Repair Pros" },
      { href: "/admin/accounts", label: "Accounts & sync" },
      { href: "/admin/users", label: "All users" },
      { href: "/admin/verification", label: "Verification overview" },
    ],
  },
  {
    label: "Care tools",
    items: [
      { href: "/admin/customer-review", label: "Customer ID review" },
      { href: "/admin/pro-review", label: "Pro ID review" },
      { href: "/admin/verification", label: "Verification board" },
      { href: "/admin/health", label: "Service health" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/admin/messages", label: "Messages" },
      { href: "/admin/reviews", label: "Reviews" },
      { href: "/admin/signups", label: "Signups" },
      { href: "/admin/audit", label: "Audit trail" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/health", label: "Health" },
      { href: "/admin/staff", label: "Staff levels 🔒", password: true },
      { href: "/admin/settings", label: "Settings 🔒", password: true },
      { href: "/admin/features", label: "Features 🔒", password: true },
      { href: "/admin/services", label: "Services" },
      { href: "/admin/matching", label: "Matching" },
      { href: "/admin/content", label: "Content & menus" },
    ],
  },
];

const THEME_KEY = "ona-admin-theme";

export function AdminShell({
  children,
  adminName,
  roleLabel,
  adminRole: adminRoleProp,
}: {
  children: ReactNode;
  adminName?: string;
  roleLabel?: string;
  adminRole?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [navCounts, setNavCounts] = useState<{
    customers: number;
    pros: number;
  }>({ customers: 0, pros: 0 });
  const [resolvedRole, setResolvedRole] = useState<AdminRoleUi>("super_admin");
  /** Fast search across every admin directory / nav item */
  const [navSearch, setNavSearch] = useState("");
  /** Phone mode: sidebar slides in as an overlay drawer (≤900px) */
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  /**
   * Activity keep-alive: while an admin tab is open AND visible, gently
   * touch the session every 5 minutes so the 4h idle timeout only counts
   * real inactivity (no surprise logouts mid-work). The 8h hard cap and
   * server-side idle enforcement stay fully intact.
   */
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/admin/auth/me", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => undefined);
    };
    ping();
    const t = window.setInterval(ping, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Close the phone drawer with Escape
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  const role = normalizeAdminRoleUi(adminRoleProp || resolvedRole);
  const roleUi = adminRoleTheme(role);
  const displayRole = roleLabel || roleUi.label;

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
    const next = saved === "dark" || saved === "light" ? saved : "light";
    setTheme(next);
    document.querySelector(".om-admin-root")?.setAttribute("data-theme", next);
  }, []);

  // Resolve role from session if parent didn't pass it
  useEffect(() => {
    if (adminRoleProp) {
      setResolvedRole(normalizeAdminRoleUi(adminRoleProp));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled || !json?.ok) return;
        setResolvedRole(normalizeAdminRoleUi(json.data?.adminRole));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminRoleProp]);

  useEffect(() => {
    const root = document.querySelector(".om-admin-root");
    root?.setAttribute("data-admin-role", role);
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/pending-counts", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          data?: { nav?: { customers?: number; pros?: number } };
        } | null;
        if (cancelled || !json?.ok || !json.data?.nav) return;
        setNavCounts({
          customers: Number(json.data.nav.customers) || 0,
          pros: Number(json.data.nav.pros) || 0,
        });
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [pathname]);

  const visibleGroups = useMemo(() => {
    const allowed = new Set(navGroupsForRoleUi(role));
    const q = navSearch.trim().toLowerCase();
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (!canAccessAdminPathUi(role, item.href)) return false;
        if (!q) return true;
        return (
          item.label.toLowerCase().includes(q) ||
          item.href.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q)
        );
      }),
    })).filter((g) => allowed.has(g.label) && g.items.length > 0);
  }, [role, navSearch]);

  function applyTheme(next: "light" | "dark") {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.querySelector(".om-admin-root")?.setAttribute("data-theme", next);
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    await fetch("/api/admin/care/unlock", { method: "DELETE" }).catch(
      () => null,
    );
    router.replace("/admin/login");
    router.refresh();
  }

  async function onNavClick(
    e: MouseEvent<HTMLAnchorElement>,
    href: string,
    needsPassword?: boolean,
  ) {
    // Super Admin never needs temporary password on navigation
    if (role === "super_admin") return;
    if (!needsPassword && !isPasswordGatedPath(href)) return;
    if (pathname === href || pathname.startsWith(`${href}/`)) return;

    e.preventDefault();
    const pageName = href.split("/").pop() || "page";
    const ok = await promptSensitivePassword({
      title: `Password required`,
      detail: `Enter the temporary staff password before opening ${pageName}. Super Admin does not need this.`,
    });
    if (ok) {
      router.push(href);
    }
  }

  function badgeFor(href: string): number {
    if (href === "/admin/motorists") return navCounts.customers;
    if (href === "/admin/pros") return navCounts.pros;
    return 0;
  }

  return (
    <div
      className="om-admin-shell"
      data-admin-role={role}
    >
      <SensitivePasswordHost />
      {/* Phone mode top bar: hamburger opens the full nav drawer (≤900px) */}
      <div className="om-admin-mobile-bar">
        <button
          type="button"
          className="om-admin-mobile-toggle"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-expanded={mobileNavOpen}
          aria-label="Toggle admin menu"
        >
          {mobileNavOpen ? <X className="om-admin-mobile-toggle-ic" /> : <MenuIcon className="om-admin-mobile-toggle-ic" />}
        </button>
        <span className="om-admin-mobile-brand">{roleUi.brandTitle}</span>
      </div>
      <aside
        className={cn(
          "om-admin-nav",
          mobileNavOpen && "om-admin-nav--open",
        )}
        onClick={(e) => {
          // Navigating from the drawer closes it (phone mode)
          if ((e.target as HTMLElement).closest("a")) setMobileNavOpen(false);
        }}
      >
        <div className="om-admin-brand">
          <span className="om-admin-brand-mark" aria-hidden />
          {roleUi.brandTitle}
        </div>
        <p className="om-admin-nav-tagline">{roleUi.brandSub}</p>

        <div className="om-admin-role-chip" title={displayRole}>
          <span className="om-admin-role-dot" aria-hidden />
          {displayRole}
        </div>

        <label
          className="om-admin-nav-search"
          style={{
            display: "block",
            margin: "0.5rem 0.65rem 0.75rem",
          }}
        >
          <span className="sr-only">Search admin directories</span>
          <input
            type="search"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder="Search directories…"
            autoComplete="off"
            style={{
              width: "100%",
              height: 34,
              border: 0,
              borderRadius: 8,
              padding: "0 0.65rem",
              fontSize: 12,
              fontWeight: 600,
              background: "var(--om-admin-chip-bg, rgba(0,0,0,0.06))",
              color: "inherit",
              outline: "none",
            }}
          />
        </label>

        {visibleGroups.map((group) => (
          <div className="om-admin-nav-group" key={group.label}>
            <div
              className={
                group.label === "Care tools" || group.label === "System"
                  ? `om-admin-nav-label om-admin-nav-label--${
                      group.label === "Care tools" ? "care" : "system"
                    }`
                  : "om-admin-nav-label"
              }
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
              const count = badgeFor(item.href);
              return (
                <Link
                  key={`${group.label}-${item.href}-${item.label}`}
                  href={item.href}
                  className={active ? "active" : undefined}
                  onClick={(e) => void onNavClick(e, item.href, item.password)}
                >
                  <span className="om-admin-nav-link-row">
                    <span>{item.label}</span>
                    {count > 0 ? (
                      <span
                        className="om-admin-nav-count"
                        title="Open care items"
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
        <div className="om-admin-nav-spacer" />
        <div className="om-admin-nav-foot">
          <div className="om-admin-theme-toggle">
            <button
              type="button"
              className={theme === "light" ? "active" : undefined}
              onClick={() => applyTheme("light")}
            >
              Light
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : undefined}
              onClick={() => applyTheme("dark")}
            >
              Dark
            </button>
          </div>
          <p
            className="om-admin-muted"
            style={{ margin: 0, padding: "0 0.35rem" }}
          >
            {adminName || "Staff"}
          </p>
          <button type="button" className="om-admin-btn ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <div
        className={cn(
          "om-admin-nav-backdrop",
          mobileNavOpen && "om-admin-nav-backdrop--show",
        )}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden
      />
      <main className="om-admin-main">
        <div className="om-admin-main-rolebar">
          <span className="om-admin-role-chip om-admin-role-chip--inline">
            <span className="om-admin-role-dot" aria-hidden />
            {displayRole}
          </span>
          <span className="om-admin-muted" style={{ fontSize: 12 }}>
            Controls the live Ona app
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
