"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Navigation, X } from "lucide-react";
import { useApp } from "@/lib/store";
import type { RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Motorist popup only when a booking/request *newly* becomes accepted
 * (not on refresh / reopen with already-accepted jobs).
 */
export function AcceptTripPopup() {
  const {
    requests,
    accountType,
    theme,
    ensureChatForRequest,
    isAuthenticated,
  } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  /** Last known status per request id — used to detect pending → accepted */
  const prevStatus = useRef<Map<string, RequestStatus>>(new Map());
  const primed = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || accountType !== "motorist") {
      return;
    }

    // First run: snapshot current statuses only — never open popup on boot/refresh
    if (!primed.current) {
      const map = new Map<string, RequestStatus>();
      for (const r of requests) {
        map.set(r.id, r.status);
      }
      prevStatus.current = map;
      primed.current = true;
      return;
    }

    for (const r of requests) {
      const before = prevStatus.current.get(r.id);
      prevStatus.current.set(r.id, r.status);

      // Only fire when status *changes into* accepted (or en_route from pending)
      const becameAccepted =
        (r.status === "accepted" || r.status === "en_route") &&
        before === "pending";

      if (becameAccepted) {
        setActiveId(r.id);
        ensureChatForRequest(r);
        break;
      }
    }

    // Keep map in sync for any other status updates
    for (const r of requests) {
      prevStatus.current.set(r.id, r.status);
    }
  }, [requests, accountType, isAuthenticated, ensureChatForRequest]);

  // Reset prime when user logs out so next session re-baselines
  useEffect(() => {
    if (!isAuthenticated) {
      primed.current = false;
      prevStatus.current = new Map();
      setActiveId(null);
    }
  }, [isAuthenticated]);

  const req = requests.find((r) => r.id === activeId);
  if (!req || accountType !== "motorist") return null;
  // Don't keep showing if they already moved past accept while popup open
  if (req.status !== "accepted" && req.status !== "en_route") return null;

  return (
    <div
      className="absolute inset-0 z-[120] flex items-end justify-center bg-black/45 p-3 pb-6"
      role="dialog"
      aria-modal
      aria-labelledby="accept-trip-title"
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-2xl p-4 shadow-xl",
          isLight ? "bg-[#c8c9cd]" : "bg-neutral-950"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p
              id="accept-trip-title"
              className={cn(
                "text-[15px] font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Request accepted
            </p>
            <p
              className={cn(
                "mt-1 text-[12px] leading-snug",
                isLight ? "text-slate-600" : "text-white/65"
              )}
            >
              <strong>{req.technicianName}</strong> accepted your request for{" "}
              {req.problem}. Chat is ready — track their trip until they arrive.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0",
              isLight ? "bg-black/5 text-slate-700" : "bg-white/10 text-white"
            )}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveId(null);
              router.push(`/requests/track?id=${req.id}`);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-[#323231] py-3 text-sm font-semibold text-white"
          >
            <Navigation className="h-4 w-4" />
            Track trip
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveId(null);
              router.push("/messages");
            }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border-0 py-2.5 text-sm font-semibold",
              isLight ? "text-slate-800" : "text-white/90"
            )}
          >
            <MessageCircle className="h-4 w-4" />
            Open chat
          </button>
        </div>
      </div>
    </div>
  );
}
