"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  Clock3,
  Home,
  MessageCircle,
  Moon,
  Plus,
  Sun,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

const CLIENT_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/requests", label: "Requests", icon: Clock3 },
  { href: "/bookings", label: "Bookings", icon: Briefcase },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

const PRO_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Wrench },
  { href: "/requests", label: "Jobs", icon: Clock3 },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

const SERVICE_LABELS: Record<ProService, string> = {
  mechanic: "Mechanic",
  vulcanizer: "Vulcanizer",
  towing: "Towing",
};

const ALL_SERVICES: ProService[] = ["mechanic", "vulcanizer", "towing"];

export function AppMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    theme,
    location,
    toggleTheme,
    userMode,
    setUserMode,
    registeredAs,
    proServices,
    addProService,
    setRegisteredAs,
  } = useApp();
  const isLight = theme === "light";
  const isPro = userMode === "professional";
  const nav = isPro ? PRO_NAV : CLIENT_NAV;

  if (!open) return null;

  const switchMode = (mode: "client" | "professional") => {
    setUserMode(mode);
    onClose();
    if (mode === "professional") {
      // Ensure they have at least one pro service if switching to pro
      if (registeredAs === "client" && proServices.length === 0) {
        setRegisteredAs("mechanic");
      }
      router.push("/dashboard");
    } else {
      router.push("/");
    }
  };

  return (
    <div className="absolute inset-0 z-[100] flex" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/45 border-0"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative z-10 flex h-full w-[78%] max-w-[280px] flex-col shadow-2xl",
          isLight ? "bg-white" : "bg-black"
        )}
      >
        <div className="flex items-start justify-between px-4 pb-3 pt-4">
          <div>
            <p className="text-[18px] font-black tracking-tight">
              <span className="text-[#e85a12]">OGA</span>{" "}
              <span className={isLight ? "text-slate-900" : "text-white"}>
                MECHO
              </span>
            </p>
            <p
              className={cn(
                "mt-1 text-[11px]",
                isLight ? "text-slate-500" : "text-white/70"
              )}
            >
              {location.city} · {location.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border-0",
              isLight ? "bg-slate-100 text-slate-700" : "bg-black text-white"
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Client ↔ Professional mode switch */}
        <div className="px-3 pb-3">
          <div
            className={cn(
              "grid grid-cols-2 gap-1 rounded-lg p-1",
              isLight ? "bg-slate-100" : "bg-white/10"
            )}
            role="group"
            aria-label="App mode"
          >
            <button
              type="button"
              onClick={() => switchMode("client")}
              className={cn(
                "rounded-md py-2 text-[12px] font-bold border-0 transition-colors",
                !isPro
                  ? "metallic-orange text-white"
                  : isLight
                    ? "bg-transparent text-slate-600"
                    : "bg-transparent text-white/70"
              )}
            >
              Client
            </button>
            <button
              type="button"
              onClick={() => switchMode("professional")}
              className={cn(
                "rounded-md py-2 text-[12px] font-bold border-0 transition-colors",
                isPro
                  ? "metallic-orange text-white"
                  : isLight
                    ? "bg-transparent text-slate-600"
                    : "bg-transparent text-white/70"
              )}
            >
              Professional
            </button>
          </div>
          <p
            className={cn(
              "mt-1.5 text-[10px] leading-snug",
              isLight ? "text-slate-400" : "text-white/45"
            )}
          >
            Registered as{" "}
            <span className="font-semibold capitalize text-[#e85a12]">
              {registeredAs}
            </span>
            {" · "}opens that view first
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href + label}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "metallic-orange text-white"
                    : isLight
                      ? "text-slate-700 hover:bg-slate-100"
                      : "text-white/90 hover:bg-white/10"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                {label}
              </Link>
            );
          })}

          {/* Pros: add more services */}
          {isPro && (
            <div className="mt-3 px-1">
              <p
                className={cn(
                  "mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wide",
                  isLight ? "text-slate-400" : "text-white/45"
                )}
              >
                My services
              </p>
              <div className="space-y-1">
                {ALL_SERVICES.map((svc) => {
                  const active = proServices.includes(svc);
                  const isPrimary = registeredAs === svc;
                  return (
                    <button
                      key={svc}
                      type="button"
                      disabled={active}
                      onClick={() => addProService(svc)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] font-semibold border-0",
                        active
                          ? isLight
                            ? "bg-orange-50 text-[#e85a12]"
                            : "bg-[#e85a12]/15 text-[#e85a12]"
                          : isLight
                            ? "bg-slate-50 text-slate-600 hover:bg-slate-100"
                            : "bg-white/5 text-white/80 hover:bg-white/10"
                      )}
                    >
                      <span>
                        {SERVICE_LABELS[svc]}
                        {isPrimary && (
                          <span className="ml-1 text-[10px] font-normal opacity-70">
                            (primary)
                          </span>
                        )}
                      </span>
                      {active ? (
                        <span className="text-[10px] font-bold">Active</span>
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        <div className="px-3 pb-4">
          <button
            type="button"
            onClick={() => {
              toggleTheme();
            }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold",
              isLight
                ? "bg-slate-100 text-slate-800"
                : "bg-white/10 text-white"
            )}
          >
            {isLight ? (
              <>
                <Moon className="h-4 w-4" />
                Dark mode
              </>
            ) : (
              <>
                <Sun className="h-4 w-4" />
                Light mode
              </>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}
