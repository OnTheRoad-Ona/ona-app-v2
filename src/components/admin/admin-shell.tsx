"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  isPasswordGatedPath,
  promptSensitivePassword,
  SensitivePasswordHost,
} from "@/components/admin/sensitive-unlock";

/**
 * Customer Care–first navigation.
 * 🔒 routes open a password popup *before* navigation.
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
    label: "Customer Care",
    items: [
      { href: "/admin", label: "Dashboard", exact: true },
      { href: "/admin/jobs", label: "Live jobs" },
      { href: "/admin/disputes", label: "Disputes & appeals" },
      { href: "/admin/payments", label: "Escrow & payments" },
      { href: "/admin/pros", label: "Repair Pros" },
      { href: "/admin/artisans", label: "Artisan review" },
      { href: "/admin/users", label: "Users" },
      { href: "/admin/verification", label: "Verification" },
      { href: "/admin/audit", label: "Audit trail" },
    ],
  },
  {
    label: "Directory",
    items: [
      { href: "/admin/motorists", label: "Motorists" },
      { href: "/admin/messages", label: "Messages" },
      { href: "/admin/reviews", label: "Reviews" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/health", label: "Health" },
      { href: "/admin/signups", label: "Signups" },
      { href: "/admin/settings", label: "Settings 🔒", password: true },
      { href: "/admin/features", label: "Features 🔒", password: true },
      { href: "/admin/services", label: "Services" },
      { href: "/admin/matching", label: "Matching" },
      { href: "/admin/content", label: "Content" },
    ],
  },
];

const THEME_KEY = "ogamecho-admin-theme";

export function AdminShell({
  children,
  adminName,
  roleLabel,
}: {
  children: ReactNode;
  adminName?: string;
  roleLabel?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
    const next = saved === "dark" || saved === "light" ? saved : "light";
    setTheme(next);
    document.querySelector(".om-admin-root")?.setAttribute("data-theme", next);
  }, []);

  function applyTheme(next: "light" | "dark") {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.querySelector(".om-admin-root")?.setAttribute("data-theme", next);
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    await fetch("/api/admin/care/unlock", { method: "DELETE" }).catch(() => null);
    router.replace("/admin/login");
    router.refresh();
  }

  async function onNavClick(
    e: MouseEvent<HTMLAnchorElement>,
    href: string,
    needsPassword?: boolean
  ) {
    if (!needsPassword && !isPasswordGatedPath(href)) return;
    // Already on that page — allow
    if (pathname === href || pathname.startsWith(`${href}/`)) return;

    e.preventDefault();
    const pageName = href.split("/").pop() || "page";
    const ok = await promptSensitivePassword({
      title: `Password required`,
      detail: `Enter the temporary password before opening ${pageName}. This page is restricted.`,
    });
    if (ok) {
      router.push(href);
    }
  }

  return (
    <div className="om-admin-shell">
      <SensitivePasswordHost />
      <aside className="om-admin-nav">
        <div className="om-admin-brand">
          Ona Care
        </div>
        <p
          className="om-admin-muted"
          style={{ margin: "0 0.35rem 0.75rem", fontSize: 12 }}
        >
          Customer Care desk
        </p>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="om-admin-nav-label">{group.label}</div>
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "active" : undefined}
                  onClick={(e) =>
                    void onNavClick(e, item.href, item.password)
                  }
                >
                  {item.label}
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
          <p className="om-admin-muted" style={{ margin: 0, padding: "0 0.35rem" }}>
            {adminName || "Staff"}
            {roleLabel ? (
              <>
                <br />
                <span style={{ fontSize: 11 }}>{roleLabel}</span>
              </>
            ) : null}
          </p>
          <button type="button" className="om-admin-btn ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="om-admin-main">{children}</main>
    </div>
  );
}
