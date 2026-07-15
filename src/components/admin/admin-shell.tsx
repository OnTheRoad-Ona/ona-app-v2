"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const NAV_GROUPS: { label: string; items: { href: string; label: string; exact?: boolean }[] }[] =
  [
    {
      label: "Overview",
      items: [{ href: "/admin", label: "Dashboard", exact: true }],
    },
    {
      label: "People",
      items: [
        { href: "/admin/users", label: "Users & roles" },
        { href: "/admin/motorists", label: "Motorists" },
        { href: "/admin/pros", label: "Repair Pros" },
        { href: "/admin/verification", label: "Identity verify" },
      ],
    },
    {
      label: "Operations",
      items: [
        { href: "/admin/jobs", label: "Jobs / requests" },
        { href: "/admin/bookings", label: "Bookings" },
        { href: "/admin/payments", label: "Payments" },
        { href: "/admin/messages", label: "Messages" },
        { href: "/admin/reviews", label: "Reviews" },
      ],
    },
    {
      label: "App control",
      items: [
        { href: "/admin/settings", label: "App settings" },
        { href: "/admin/features", label: "Feature flags" },
        { href: "/admin/content", label: "Content & copy" },
        { href: "/admin/services", label: "Services catalog" },
        { href: "/admin/matching", label: "Map & matching" },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/health", label: "System health" },
        { href: "/admin/signups", label: "Signup events" },
        { href: "/admin/audit", label: "Audit log" },
      ],
    },
  ];

const THEME_KEY = "ogamecho-admin-theme";

export function AdminShell({
  children,
  adminName,
}: {
  children: ReactNode;
  adminName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
    const next = saved === "dark" || saved === "light" ? saved : "light";
    setTheme(next);
    document
      .querySelector(".om-admin-root")
      ?.setAttribute("data-theme", next);
  }, []);

  function applyTheme(next: "light" | "dark") {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document
      .querySelector(".om-admin-root")
      ?.setAttribute("data-theme", next);
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="om-admin-shell">
      <aside className="om-admin-nav">
        <div className="om-admin-brand">
          Oga<span>Mecho</span> Admin
        </div>
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
              Light grey
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : undefined}
              onClick={() => applyTheme("dark")}
            >
              Dark grey
            </button>
          </div>
          <p className="om-admin-muted" style={{ margin: 0, padding: "0 0.35rem" }}>
            {adminName || "Admin"}
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
