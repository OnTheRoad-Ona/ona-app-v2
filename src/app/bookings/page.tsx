"use client";

import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function BookingsPage() {
  const { bookings, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader title="Bookings" subtitle="Scheduled repairs" />

      <div className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-hide">
        {bookings.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No bookings yet.</p>
        ) : (
          bookings.map((b) => (
            <article key={b.id} className="card-surface rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className={cn(
                      "text-sm font-bold",
                      isLight ? "text-slate-900" : "text-white",
                    )}
                  >
                    {b.technicianName}
                  </p>
                  <p className="text-xs capitalize text-muted">
                    {b.serviceType}
                  </p>
                </div>
                <Badge
                  variant={b.status === "upcoming" ? "soft" : "secondary"}
                  className="capitalize text-[10px]"
                >
                  {b.status}
                </Badge>
              </div>
              <p
                className={cn(
                  "mt-2 flex items-center gap-1.5 text-xs",
                  isLight ? "text-slate-700" : "text-white/85",
                )}
              >
                <Calendar className="h-3.5 w-3.5 text-brand" />
                {b.date} · {b.time}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{b.locationLabel}</p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
