"use client";

/**
 * Past request / job — view-only full process.
 * Acceptance, trip, arrival, work, payment, chat (read-only), rating.
 * Flat stage layout: no extra panels, glow, or gradients.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  MessageCircle,
  Star,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  CONVERSATION_ENDED_MESSAGE,
  readOnlyChatHref,
} from "@/lib/chat-expired";
import { apiGetJob } from "@/lib/jobs/client";
import { CalloutFeeLines } from "@/components/jobs/callout-fee-lines";
import { useJobCallout } from "@/lib/callout/use-job-callout";
import type { JobFlowStatus, JobOffer, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function stepTitle(s: JobFlowStatus, isPro: boolean): string {
  switch (s) {
    case "negotiating":
      return isPro ? "Request received" : "Request sent";
    case "agreed":
      return "Price accepted";
    case "paid_booked":
      return "Paid & booked";
    case "en_route":
      return isPro ? "Trip started · on the road" : "Pro en route";
    case "arrived":
      return "Arrived on site";
    case "in_progress":
      return "Work in progress";
    case "completed":
      return "Work marked complete";
    case "satisfied":
      return "Customer confirmed satisfaction";
    case "released":
      return "Payment released";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Negotiation expired";
    case "disputed":
      return "Dispute opened";
    case "under_appeal":
      return "Under appeal";
    case "refunded":
      return "Refunded";
    default:
      return String(s).replace(/_/g, " ");
  }
}

function statusLabel(s: JobFlowStatus): string {
  switch (s) {
    case "completed":
      return "Completed";
    case "satisfied":
    case "released":
      return "Finished";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "disputed":
      return "Disputed";
    case "under_appeal":
      return "Under appeal";
    case "refunded":
      return "Refunded";
    default:
      return String(s).replace(/_/g, " ");
  }
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatWhenShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function historyAt(
  job: JobRecord,
  status: JobFlowStatus | JobFlowStatus[]
): string | null {
  const want = Array.isArray(status) ? status : [status];
  const hits = (job.statusHistory || []).filter((h) => want.includes(h.status));
  if (!hits.length) return null;
  hits.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return hits[hits.length - 1]?.at ?? null;
}

function hasReached(job: JobRecord, status: JobFlowStatus): boolean {
  if (job.status === status) return true;
  return (job.statusHistory || []).some((h) => h.status === status);
}

function offerSideLabel(side: JobOffer["side"], isPro: boolean): string {
  if (side === "repair_pro") return isPro ? "You" : "Repair Pro";
  return isPro ? "Customer" : "You";
}

function Section({
  title,
  children,
  muted,
}: {
  title: string;
  children: React.ReactNode;
  muted: string;
}) {
  return (
    <section className="bg-transparent">
      <p
        className={cn(
          "mb-2 text-[11px] font-semibold uppercase tracking-wide",
          muted
        )}
      >
        {title}
      </p>
      {children}
    </section>
  );
}

function DetailRow({
  label,
  value,
  ink,
  muted,
}: {
  label: string;
  value: string;
  ink: string;
  muted: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className={cn("shrink-0 text-[12px] font-medium", muted)}>
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 text-right text-[13px] font-semibold leading-snug",
          ink
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function RequestProcessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    theme,
    accountType,
    backendUserId,
    visibleMessageThreads,
    refreshCloudChats,
  } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expiredOpen, setExpiredOpen] = useState(false);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const hairline = isLight ? "border-black/10" : "border-white/10";
  const backHref = isPro ? "/jobs" : "/history";
  const calloutQuote = useJobCallout(job?.id);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await apiGetJob(id);
    if (!res.ok) {
      if (res.message === "Job not found") {
        router.replace(accountType === "professional" ? "/jobs" : "/");
        return;
      }
      setErr(res.message || "Could not load job");
      setJob(null);
      setLoading(false);
      return;
    }
    const j = res.data.job;
    if (
      backendUserId &&
      j.motoristId !== backendUserId &&
      j.repairProId !== backendUserId
    ) {
      setErr("You do not have access to this job.");
      setJob(null);
      setLoading(false);
      return;
    }
    setJob(j);
    setErr(null);
    setLoading(false);
  }, [id, backendUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshCloudChats();
  }, [refreshCloudChats, id]);

  const chatThread = useMemo(() => {
    if (!job) return null;
    return (
      visibleMessageThreads.find(
        (t) => t.requestId === job.id || t.id === job.id
      ) ?? null
    );
  }, [job, visibleMessageThreads]);

  if (loading) {
    return (
      <div className={cn("flex h-full flex-col", stage)}>
        <PageHeader title="Job details" backHref={backHref} />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#FF6B35]" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className={cn("flex h-full flex-col", stage)}>
        <PageHeader title="Job details" backHref={backHref} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className={cn("text-[15px] font-semibold", ink)}>
            {err || "Job not found"}
          </p>
          <button
            type="button"
            onClick={() => router.push(isPro ? "/jobs" : "/")}
            className="h-11 rounded-md border-0 bg-[#2c2c2e] px-5 text-[13px] font-semibold text-white"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const counterpart = isPro ? job.motoristName : job.repairProName;
  const skill = PRO_SERVICE_LABELS[job.serviceType] ?? job.serviceType;
  const history = [...(job.statusHistory || [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  const timeline =
    history.length > 0
      ? history
      : [
          {
            status: job.status,
            at: job.createdAt,
            by: undefined as string | undefined,
          },
        ];

  const acceptedAt =
    historyAt(job, "agreed") ||
    (job.agreedMajor != null ? job.updatedAt : null);
  const paidAt = job.paidAt || historyAt(job, "paid_booked");
  const enRouteAt = historyAt(job, "en_route");
  const arrivedAt = historyAt(job, "arrived");
  const workAt = historyAt(job, "in_progress");
  const completedAt = historyAt(job, "completed");
  const satisfiedAt =
    job.satisfiedAt || historyAt(job, ["satisfied", "released"]);
  const releasedAt = job.releasedAt || historyAt(job, "released");
  const cancelledAt = job.cancelledAt || historyAt(job, "cancelled");

  const offers = [...(job.offers || [])].sort(
    (a, b) => a.offerIndex - b.offerIndex
  );
  const chatMessages = chatThread?.messages ?? [];
  const chatPreview = chatMessages.slice(-6);

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", stage)}>
      <PageHeader title="Job details" backHref={backHref} />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-8 scrollbar-hide">
        {/* Summary */}
        <Section title="Summary" muted={muted}>
          <p className={cn("text-[17px] font-semibold", ink)}>{counterpart}</p>
          <p className={cn("mt-0.5 text-[12px] font-medium", muted)}>
            {skill}
            {isAutomotiveTrade(job.serviceType) && job.motoristVehicle ? ` · ${job.motoristVehicle}` : ""}
          </p>
          <p className={cn("mt-3 text-[14px] font-medium leading-relaxed", ink)}>
            {job.problem}
          </p>
          {job.locationLabel?.trim() && (
            <p className={cn("mt-2 text-[12px] font-medium leading-snug", muted)}>
              {job.locationLabel}
            </p>
          )}
          {job.agreedMajor != null && (
            <p className={cn("mt-3 text-[20px] font-semibold tabular-nums", ink)}>
              {formatMoney(job.agreedMajor, job.currency)}
              <span className={cn("ml-1.5 text-[11px] font-medium", muted)}>
                labour only
              </span>
            </p>
          )}
          <div className="mt-2">
            <CalloutFeeLines
              quote={calloutQuote}
              currency={job.currency}
              ink={ink}
              muted={muted}
            />
          </div>
          <div className="mt-2 pt-1">
            <DetailRow
              label="Status"
              value={statusLabel(job.status)}
              ink={ink}
              muted={muted}
            />
            <DetailRow
              label="Requested"
              value={formatWhen(job.createdAt)}
              ink={ink}
              muted={muted}
            />
            <DetailRow
              label="Updated"
              value={formatWhen(job.updatedAt)}
              ink={ink}
              muted={muted}
            />
            {job.paymentReference && (
              <DetailRow
                label="Payment ref"
                value={job.paymentReference}
                ink={ink}
                muted={muted}
              />
            )}
          </div>
        </Section>

        {/* Evidence media */}
        {(job.photos?.length > 0 || job.voiceNote) && (
          <Section title="Request media" muted={muted}>
            {job.voiceNote?.url && (
              <div className="mb-3">
                <p className={cn("mb-1.5 text-[12px] font-medium", muted)}>
                  Voice note
                </p>
                <VoiceNotePlayer
                  url={job.voiceNote.url}
                  durationSec={job.voiceNote.durationSec}
                  isLight={isLight}
                />
              </div>
            )}
            {job.photos?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {job.photos.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.id}
                    src={p.url}
                    alt={p.name || "Job photo"}
                    className="h-20 w-20 rounded-md object-cover"
                  />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Acceptance / negotiation */}
        <Section title="Acceptance & negotiation" muted={muted}>
          <DetailRow
            label="Opening price"
            value={
              job.proBaseMajor != null
                ? formatMoney(job.proBaseMajor, job.currency)
                : "Not set"
            }
            ink={ink}
            muted={muted}
          />
          <DetailRow
            label="Agreed price"
            value={
              job.agreedMajor != null
                ? formatMoney(job.agreedMajor, job.currency)
                : "Not agreed"
            }
            ink={ink}
            muted={muted}
          />
          <DetailRow
            label="Accepted at"
            value={acceptedAt ? formatWhen(acceptedAt) : "Not set"}
            ink={ink}
            muted={muted}
          />
          <DetailRow
            label="Offers"
            value={
              offers.length
                ? `${offers.length} of ${job.maxOffers || 6}`
                : "None recorded"
            }
            ink={ink}
            muted={muted}
          />

          {offers.length > 0 && (
            <ol className="mt-3 space-y-0 pt-2">
              {offers.map((o) => (
                <li
                  key={o.id}
                  className={cn(
                    "flex items-start justify-between gap-3 py-2",
                    hairline
                  )}
                >
                  <div className="min-w-0">
                    <p className={cn("text-[13px] font-semibold", ink)}>
                      Offer {o.offerIndex} · {offerSideLabel(o.side, isPro)}
                    </p>
                    <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                      {formatWhenShort(o.createdAt)}
                    </p>
                  </div>
                  <p className={cn("shrink-0 text-[14px] font-semibold tabular-nums", ink)}>
                    {formatMoney(o.amountMajor, o.currency || job.currency)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Payment */}
        <Section title="Payment" muted={muted}>
          <DetailRow
            label="Paid & booked"
            value={
              paidAt || hasReached(job, "paid_booked")
                ? formatWhen(paidAt) || "Yes"
                : "Not paid"
            }
            ink={ink}
            muted={muted}
          />
          <DetailRow
            label="Escrow"
            value={job.escrowStatus || "Not set"}
            ink={ink}
            muted={muted}
          />
          {job.amountMinor != null && (
            <DetailRow
              label="Escrow amount"
              value={formatMoney(job.amountMinor / 100, job.currency)}
              ink={ink}
              muted={muted}
            />
          )}
          {job.proPayoutMinor != null && isPro && (
            <DetailRow
              label="Your payout"
              value={formatMoney(job.proPayoutMinor / 100, job.currency)}
              ink={ink}
              muted={muted}
            />
          )}
          <DetailRow
            label="Released"
            value={
              releasedAt || hasReached(job, "released")
                ? formatWhen(releasedAt) || "Yes"
                : "Not set"
            }
            ink={ink}
            muted={muted}
          />
          {cancelledAt && (
            <DetailRow
              label="Cancelled"
              value={formatWhen(cancelledAt)}
              ink={ink}
              muted={muted}
            />
          )}
        </Section>

        {/* Trip */}
        <Section title="Trip" muted={muted}>
          <DetailRow
            label="En route"
            value={
              enRouteAt || hasReached(job, "en_route")
                ? formatWhen(enRouteAt) || "Started"
                : "Not started"
            }
            ink={ink}
            muted={muted}
          />
          <DetailRow
            label="Meet location"
            value={job.locationLabel?.trim() || "Not set"}
            ink={ink}
            muted={muted}
          />
          {(job.distanceText || job.distanceKm != null) && (
            <DetailRow
              label="Distance"
              value={
                job.distanceText ||
                (job.distanceKm != null
                  ? `${job.distanceKm.toFixed(1)} km`
                  : "Not set")
              }
              ink={ink}
              muted={muted}
            />
          )}
          {(job.etaText || job.etaMinutes != null) && (
            <DetailRow
              label="ETA (last)"
              value={
                job.etaText ||
                (job.etaMinutes != null ? `${job.etaMinutes} min` : "Not set")
              }
              ink={ink}
              muted={muted}
            />
          )}
        </Section>

        {/* Arrival */}
        <Section title="Arrival" muted={muted}>
          <DetailRow
            label="Arrived on site"
            value={
              arrivedAt || hasReached(job, "arrived")
                ? formatWhen(arrivedAt) || "Yes"
                : "Not recorded"
            }
            ink={ink}
            muted={muted}
          />
          <DetailRow
            label="Work started"
            value={
              workAt || hasReached(job, "in_progress")
                ? formatWhen(workAt) || "Yes"
                : "Not set"
            }
            ink={ink}
            muted={muted}
          />
        </Section>

        {/* Completion */}
        <Section title="Completion" muted={muted}>
          <DetailRow
            label="Work complete"
            value={
              completedAt || hasReached(job, "completed")
                ? formatWhen(completedAt) || "Yes"
                : "Not set"
            }
            ink={ink}
            muted={muted}
          />
          <DetailRow
            label="Customer confirmed"
            value={
              satisfiedAt || hasReached(job, "satisfied")
                ? formatWhen(satisfiedAt) || "Yes"
                : "Not set"
            }
            ink={ink}
            muted={muted}
          />
        </Section>

        {/* Dispute */}
        {job.dispute && (
          <Section title="Dispute" muted={muted}>
            <DetailRow
              label="Opened by"
              value={job.dispute.openedBy.replace(/_/g, " ")}
              ink={ink}
              muted={muted}
            />
            <DetailRow
              label="Reason"
              value={job.dispute.reason.replace(/_/g, " ")}
              ink={ink}
              muted={muted}
            />
            <DetailRow
              label="Status"
              value={job.dispute.status.replace(/_/g, " ")}
              ink={ink}
              muted={muted}
            />
            {job.dispute.description?.trim() && (
              <p className={cn("mt-2 text-[13px] font-medium leading-snug", ink)}>
                {job.dispute.description.trim()}
              </p>
            )}
          </Section>
        )}

        {/* Chat — read-only summary + open thread */}
        <Section title="Chat" muted={muted}>
          <div className="flex items-start gap-2.5">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B35]" />
            <div className="min-w-0 flex-1">
              {chatThread ? (
                <>
                  <p className={cn("text-[13px] font-semibold", ink)}>
                    {chatMessages.length} message
                    {chatMessages.length === 1 ? "" : "s"}
                  </p>
                  <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                    History is readable · send is locked for closed jobs
                  </p>
                  {chatPreview.length > 0 && (
                    <ul className="mt-3 space-y-2 pt-2">
                      {chatPreview.map((m) => (
                        <li key={m.id} className="min-w-0">
                          <p className={cn("text-[10px] font-semibold", muted)}>
                            {m.sender === "motorist"
                              ? job.motoristName
                              : m.sender === "professional"
                                ? job.repairProName
                                : "System"}
                            {m.at ? ` · ${formatWhenShort(m.at)}` : ""}
                          </p>
                          <p
                            className={cn(
                              "mt-0.5 line-clamp-3 text-[12px] font-medium leading-snug",
                              ink
                            )}
                          >
                            {m.text ||
                              (m.voiceUrl ? "Voice note" : "Attachment")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpiredOpen(true)}
                    className={cn(
                      "mt-3 inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[13px] font-semibold text-[#FF6B35]"
                    )}
                  >
                    Open chat history
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <p className={cn("text-[13px] font-medium leading-snug", muted)}>
                  No chat thread was opened for this job, or messages are not
                  available on this device.
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* Rating */}
        {(job.rating != null && job.rating > 0) || job.ratingNote?.trim() ? (
          <Section title="Customer rating" muted={muted}>
            {job.rating != null && job.rating > 0 && (
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      "h-4 w-4",
                      n <= Number(job.rating)
                        ? "fill-[#FF6B35] text-[#FF6B35]"
                        : isLight
                          ? "text-slate-400"
                          : "text-white/30"
                    )}
                    strokeWidth={1.75}
                  />
                ))}
                <span className={cn("ml-1 text-[13px] font-semibold", ink)}>
                  {job.rating}/5
                </span>
              </div>
            )}
            {job.ratingNote?.trim() && (
              <p className={cn("mt-2 text-[13px] font-medium leading-snug", ink)}>
                “{job.ratingNote.trim()}”
              </p>
            )}
          </Section>
        ) : null}

        {/* Full process timeline */}
        <Section title="Full process" muted={muted}>
          <ol className="relative space-y-0 pl-0">
            {timeline.map((h, i) => (
              <li
                key={`${h.status}-${h.at}-${i}`}
                className="relative flex gap-3 pb-5 last:pb-0"
              >
                <div className="flex flex-col items-center">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF6B35] text-white">
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  {i < timeline.length - 1 && (
                    <span
                      className={cn(
                        "mt-1 min-h-[12px] w-px flex-1",
                        isLight ? "bg-black/15" : "bg-white/20"
                      )}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className={cn("text-[14px] font-semibold", ink)}>
                    {stepTitle(h.status, isPro)}
                  </p>
                  <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                    {formatWhen(h.at)}
                    {h.by ? ` · ${h.by.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <ExpiredDialog
        open={expiredOpen}
        isLight={isLight}
        message={CONVERSATION_ENDED_MESSAGE}
        onClose={() => setExpiredOpen(false)}
        onView={
          chatThread
            ? () => {
                setExpiredOpen(false);
                router.push(readOnlyChatHref(chatThread.id));
              }
            : undefined
        }
      />
    </div>
  );
}
