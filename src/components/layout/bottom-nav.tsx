"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Clock3,
  Home,
  UserRound,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n/messages";

/** No Messages tab — chat only from an active request/job. */
const items: {
  href: string;
  labelKey: MessageKey;
  icon: typeof Home;
}[] = [
  { href: "/", labelKey: "nav.home", icon: Home },
  { href: "/jobs", labelKey: "nav.jobs", icon: Briefcase },
  { href: "/requests", labelKey: "nav.requests", icon: Clock3 },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();
  const { theme } = useApp();
  const t = useT();
  const isLight = theme === "light";

  return (
    <nav
      className={cn(
        "shrink-0 border-0 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
      aria-label="Main navigation"
    >
      <ul className="flex items-stretch justify-between">
        {items.map(({ href, labelKey, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors",
                  active
                    ? "text-brand"
                    : isLight
                      ? "text-slate-400 hover:text-slate-600"
                      : "text-white/65 hover:text-white"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn("h-5 w-5", active && "fill-brand/15")}
                  strokeWidth={active ? 2.4 : 2}
                />
                {t(labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
