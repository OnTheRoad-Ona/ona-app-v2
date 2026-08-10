"use client";

/**
 * Compact vehicle chip bar for existing Shop shell (no redesign of shop chrome).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, ChevronRight, Loader2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/api-auth-headers";
import { isVehicleTrade } from "@/lib/shop/taxonomy";

export type ActiveVehicle = {
  id?: string;
  vehicleTypeSlug?: string;
  makeName: string;
  modelName: string;
  year: number | null;
  makeId?: string | null;
  modelId?: string | null;
};

const SESSION_KEY = "ona_shop_active_vehicle";

export function readSessionVehicle(): ActiveVehicle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveVehicle;
  } catch {
    return null;
  }
}

export function writeSessionVehicle(v: ActiveVehicle | null) {
  if (typeof window === "undefined") return;
  if (!v) sessionStorage.removeItem(SESSION_KEY);
  else sessionStorage.setItem(SESSION_KEY, JSON.stringify(v));
}

export function ShopVehicleBar({
  tradeKey,
  onVehicle,
}: {
  tradeKey?: string;
  onVehicle?: (v: ActiveVehicle | null) => void;
}) {
  const { theme, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const [active, setActive] = useState<ActiveVehicle | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback(
    (v: ActiveVehicle | null) => {
      setActive(v);
      writeSessionVehicle(v);
      onVehicle?.(v);
    },
    [onVehicle]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const session = readSessionVehicle();
      if (session) {
        if (!cancelled) apply(session);
      }
      if (isAuthenticated) {
        try {
          const res = await authFetch("/api/shop/vehicles");
          const json = (await res.json()) as {
            ok?: boolean;
            data?: { active?: ActiveVehicle | null };
          };
          if (!cancelled && json.ok && json.data?.active) {
            const a = json.data.active;
            apply({
              id: a.id,
              vehicleTypeSlug: a.vehicleTypeSlug,
              makeName: a.makeName,
              modelName: a.modelName,
              year: a.year,
              makeId: a.makeId,
              modelId: a.modelId,
            });
          }
        } catch {
          /* keep session */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, apply]);

  const label = active
    ? [active.year, active.makeName, active.modelName].filter(Boolean).join(" ")
    : "Select vehicle";

  // Vehicle fitment belongs ONLY to vehicle-based trades (mechanic, body,
  // diagnostics, etc.). Non-vehicle trades (solar, plumber, carpenter,
  // generator, painter, wash) never render the garage / ALL PARTS bar.
  if (tradeKey && !isVehicleTrade(tradeKey)) return null;

  return (
    <div className="px-3 pt-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2.5",
          isLight ? "bg-white/95" : "bg-[#1c1c1e]"
        )}
      >
        <Car className="h-4 w-4 shrink-0 text-[#FF6B35]" />
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#FF6B35]" />
        ) : (
          <button
            type="button"
            onClick={() => router.push("/shop/vehicles")}
            className={cn(
              "min-w-0 flex-1 border-0 bg-transparent text-left text-[13px] font-bold outline-none",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            <span className="line-clamp-1">{label}</span>
            <span
              className={cn(
                "mt-0.5 block text-[10px] font-semibold",
                isLight ? "text-slate-500" : "text-white/45"
              )}
            >
              {active
                ? "Tap to change · ALL PARTS available"
                : isAuthenticated
                  ? "Garage · pick make / model / year"
                  : "Sign in to save vehicles"}
            </span>
          </button>
        )}
        {active && tradeKey ? (
          <button
            type="button"
            onClick={() =>
              router.push(
                `/shop/c/${tradeKey}?allParts=1&makeName=${encodeURIComponent(active.makeName)}&modelName=${encodeURIComponent(active.modelName)}${active.year ? `&year=${active.year}` : ""}${active.makeId ? `&makeId=${active.makeId}` : ""}${active.modelId ? `&modelId=${active.modelId}` : ""}${active.vehicleTypeSlug ? `&vehicleType=${encodeURIComponent(active.vehicleTypeSlug)}` : ""}`
              )
            }
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border-0 bg-[#FF6B35] px-2.5 py-1.5 text-[11px] font-bold text-white"
          >
            ALL PARTS
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/shop/vehicles")}
            className="inline-flex shrink-0 items-center rounded-lg border-0 bg-[#FF6B35]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#FF6B35]"
          >
            Garage
          </button>
        )}
      </div>
    </div>
  );
}
