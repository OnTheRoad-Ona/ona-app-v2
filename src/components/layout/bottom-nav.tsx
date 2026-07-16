"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Clock3,
  Home,
  MessageCircle,
  UserRound,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/requests", label: "Requests", icon: Clock3 },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { theme } = useApp();
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
        {items.map(({ href, label, icon: Icon }) => {
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
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
