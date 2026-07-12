"use client";

import Link from "next/link";
import {
  ChevronRight,
  MapPin,
  Settings,
  Shield,
  Wrench,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import type { ProService, RegisteredAs } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { id: RegisteredAs; label: string; hint: string }[] = [
  { id: "client", label: "Client", hint: "Find help nearby" },
  { id: "mechanic", label: "Mechanic", hint: "Offer repairs" },
  { id: "vulcanizer", label: "Vulcanizer", hint: "Tires & tubes" },
  { id: "towing", label: "Towing", hint: "Haul vehicles" },
];

const SERVICE_LABELS: Record<ProService, string> = {
  mechanic: "Mechanic",
  vulcanizer: "Vulcanizer",
  towing: "Towing",
};

const ALL_SERVICES: ProService[] = ["mechanic", "vulcanizer", "towing"];

export default function ProfilePage() {
  const {
    location,
    setManualLocation,
    theme,
    registeredAs,
    setRegisteredAs,
    userMode,
    proServices,
    addProService,
    setUserMode,
  } = useApp();
  const isLight = theme === "light";
  const isProRegistered = registeredAs !== "client";

  const displayName =
    registeredAs === "client"
      ? "Vehicle Owner"
      : `${SERVICE_LABELS[registeredAs]} Pro`;

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-white" : "bg-black"
      )}
    >
      <PageHeader title="Profile" subtitle="Account & settings" />

      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
        <div className="card-surface flex items-center gap-3 rounded-lg p-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-brand text-sm font-bold text-white">
              {registeredAs === "client" ? "YO" : "PR"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p
              className={cn(
                "text-base font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              {displayName}
            </p>
            <p className="text-xs text-muted">+234 800 000 0000</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
              <MapPin className="h-3 w-3 text-brand" />
              {location.label}
            </p>
          </div>
        </div>

        {/* Registration role — what opens first */}
        <div className="card-surface mt-3 rounded-lg p-3">
          <p
            className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Registered as
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            First screen when you open the app. You can still switch modes in
            the menu.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {ROLE_OPTIONS.map(({ id, label, hint }) => {
              const active = registeredAs === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setRegisteredAs(id);
                    if (id !== "client") setUserMode("professional");
                    else setUserMode("client");
                  }}
                  className={cn(
                    "rounded-md border-0 px-2.5 py-2 text-left transition-colors",
                    active
                      ? "metallic-orange text-white"
                      : isLight
                        ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "bg-white/10 text-white/85 hover:bg-white/15"
                  )}
                >
                  <span className="block text-[12px] font-bold">{label}</span>
                  <span
                    className={cn(
                      "block text-[10px]",
                      active ? "text-white/85" : "text-muted"
                    )}
                  >
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Add more services when pro */}
        {isProRegistered && (
          <div className="card-surface mt-3 rounded-lg p-3">
            <p
              className={cn(
                "text-sm font-semibold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Services you run
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Primary is locked. Add more services you offer.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
                      "rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
                      active
                        ? "metallic-orange text-white"
                        : isLight
                          ? "bg-slate-100 text-slate-600"
                          : "bg-white/10 text-white/80"
                    )}
                  >
                    {SERVICE_LABELS[svc]}
                    {isPrimary ? " · primary" : active ? "" : " · add"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="card-surface mt-3 overflow-hidden rounded-lg">
          {[
            ...(userMode === "professional" || isProRegistered
              ? [
                  {
                    href: "/dashboard",
                    label: "Technician Dashboard",
                    icon: Wrench,
                  },
                ]
              : []),
            { href: "/requests", label: "My Requests", icon: Shield },
            { href: "#", label: "Settings", icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-3",
                isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft">
                <Icon className="h-4 w-4 text-brand" />
              </span>
              <span
                className={cn(
                  "flex-1 text-sm font-medium",
                  isLight ? "text-slate-800" : "text-white"
                )}
              >
                {label}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>
          ))}
        </div>

        <div className="card-surface mt-3 rounded-lg p-3">
          <p
            className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Manual location
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            If GPS fails, set your area.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Ikeja, Lagos", "Lekki, Lagos", "Yaba, Lagos", "VI, Lagos"].map(
              (loc) => (
                <Button
                  key={loc}
                  size="sm"
                  variant={location.label === loc ? "default" : "secondary"}
                  onClick={() => setManualLocation(loc)}
                >
                  {loc}
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
