"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Phone,
  XCircle,
} from "lucide-react";
import {
  VerificationBlockedPanel,
  VerificationWarningBanner,
} from "@/components/auth/verification-gate-banner";
import { CallButton } from "@/components/call/in-app-call";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import type { RequestStatus, ServiceRequest } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Service Request",
  accepted: "Accepted",
  en_route: "En route",
  arrived: "Arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Repair Pro order desk — incoming motorist requests,
 * accept / en-route / complete flow.
 */
export default function ProOrdersPage() {
  const {
    requests,
    updateRequestStatus,
    theme,
    userMode,
    accountType,
    proServices,
    displayName,
  } = useApp();
  const isLight = theme === "light";
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [warning, setWarning] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const handleUpdate = (id: string, status: RequestStatus) => {
    const result = updateRequestStatus(id, status);
    if (!result.ok) {
      setBlocked(result.message);
      setWarning(null);
      return;
    }
    setBlocked(null);
    if (result.warning) setWarning(result.warning);
  };

  const isPro =
    userMode === "professional" || accountType === "professional";

  const list = useMemo(() => {
    let rows = [...requests];
    if (filter === "open") {
      rows = rows.filter(
        (r) => !["completed", "cancelled"].includes(r.status)
      );
    }
    return rows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [requests, filter]);

  if (!isPro) {
    return (
      <div
        className={cn(
          "flex h-full flex-col",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <PageHeader title="Orders" subtitle="Repair Pro only" backHref="/" />
        <p className="p-4 text-sm text-muted">
          Switch to Professional mode in the menu to manage job orders.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="Order requests"
        subtitle={`${displayName} · ${proServices.map((s) => PRO_SERVICE_LABELS[s]).join(" · ") || "Pro"}`}
        backHref="/dashboard"
      />

      <div className="flex gap-2 px-3 pb-2">
        {(
          [
            ["open", "Active"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-lg border-0 px-3 py-1.5 text-[12px] font-bold",
              filter === id
                ? "bg-brand text-white"
                : isLight
                  ? "bg-white text-slate-600"
                  : "bg-white/10 text-white/75"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4 scrollbar-hide">
        {warning && (
          <VerificationWarningBanner
            message={warning}
            isLight={isLight}
            onDismiss={() => setWarning(null)}
          />
        )}
        {blocked && (
          <VerificationBlockedPanel
            message={blocked}
            isLight={isLight}
            onClose={() => setBlocked(null)}
          />
        )}
        {list.length === 0 ? (
          <div
            className={cn(
              "rounded-xl p-6 text-center",
              isLight ? "bg-[#c8c9cd]" : "bg-white/5"
            )}
          >
            <Clock3
              className={cn(
                "mx-auto h-8 w-8",
                isLight ? "text-slate-300" : "text-white/30"
              )}
            />
            <p
              className={cn(
                "mt-2 text-sm font-semibold",
                isLight ? "text-slate-800" : "text-white"
              )}
            >
              No {filter === "open" ? "active" : ""} orders yet
            </p>
            <p className="mt-1 text-[12px] text-muted">
              When customers request help in your trades, jobs appear here.
            </p>
          </div>
        ) : (
          list.map((job) => (
            <OrderCard
              key={job.id}
              job={job}
              isLight={isLight}
              onUpdate={handleUpdate}
            />
          ))
        )}
      </div>
    </div>
  );
}

function OrderCard({
  job,
  isLight,
  onUpdate,
}: {
  job: ServiceRequest;
  isLight: boolean;
  onUpdate: (id: string, status: RequestStatus) => void;
}) {
  const open = !["completed", "cancelled"].includes(job.status);

  return (
    <article
      className={cn(
        "rounded-xl p-3",
        isLight ? "bg-white shadow-sm" : "bg-white/[0.06]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[13px] font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {job.problem}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {PRO_SERVICE_LABELS[job.serviceType] ?? job.serviceType}
            <span className="mx-1 opacity-40">·</span>
            {STATUS_LABEL[job.status]}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold",
            job.status === "pending"
              ? "bg-amber-100 text-amber-800"
              : job.status === "completed"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-brand-soft text-brand"
          )}
        >
          {STATUS_LABEL[job.status]}
        </span>
      </div>

      <div
        className={cn(
          "mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]",
          isLight ? "text-slate-600" : "text-white/70"
        )}
      >
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3 text-brand" />
          {job.locationLabel}
        </span>
        <span>{formatDistance(job.distanceKm)}</span>
        <span>{formatEta(job.etaMinutes)}</span>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.status === "pending" && (
            <>
              <Action
                label="Accept"
                icon={CheckCircle2}
                onClick={() => onUpdate(job.id, "accepted")}
                primary
              />
              <Action
                label="Decline"
                icon={XCircle}
                onClick={() => onUpdate(job.id, "cancelled")}
              />
            </>
          )}
          {job.status === "accepted" && (
            <Action
              label="I'm en route"
              icon={Navigation}
              onClick={() => onUpdate(job.id, "en_route")}
              primary
            />
          )}
          {job.status === "en_route" && (
            <Action
              label="Arrived"
              icon={MapPin}
              onClick={() => onUpdate(job.id, "arrived")}
              primary
            />
          )}
          {job.status === "arrived" && (
            <Action
              label="Start work"
              icon={Clock3}
              onClick={() => onUpdate(job.id, "in_progress")}
              primary
            />
          )}
          {job.status === "in_progress" && (
            <Action
              label="Mark complete"
              icon={CheckCircle2}
              onClick={() => onUpdate(job.id, "completed")}
              primary
            />
          )}
          <CallButton
            label="Call motorist"
            target={{
              name: job.technicianName || "Customer",
              phone: "",
              roleLabel: "Customer",
            }}
            className={cn(
              "h-9 flex-none rounded-lg px-3 text-[11px]",
              "bg-black/8 text-slate-800 dark:bg-[#2c2c2e] dark:text-white"
            )}
          />
        </div>
      )}
    </article>
  );
}

function Action({
  label,
  icon: Icon,
  onClick,
  primary,
}: {
  label: string;
  icon: typeof CheckCircle2;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
        primary
          ? "bg-brand text-white"
          : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/85"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
