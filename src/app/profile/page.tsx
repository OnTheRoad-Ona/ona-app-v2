"use client";

import Link from "next/link";
import { ChevronRight, MapPin, Settings, Shield, Wrench } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { location, setManualLocation, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-white" : "matte-metal"
      )}
    >
      <PageHeader title="Profile" subtitle="Account & settings" />

      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
        <div className="card-surface flex items-center gap-3 rounded-lg p-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-brand text-sm font-bold text-white">
              YO
            </AvatarFallback>
          </Avatar>
          <div>
            <p
              className={cn(
                "text-base font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Vehicle Owner
            </p>
            <p className="text-xs text-muted">+234 800 000 0000</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
              <MapPin className="h-3 w-3 text-brand" />
              {location.label}
            </p>
          </div>
        </div>

        <div className="card-surface mt-3 overflow-hidden rounded-lg">
          {[
            { href: "/dashboard", label: "Technician Dashboard", icon: Wrench },
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
