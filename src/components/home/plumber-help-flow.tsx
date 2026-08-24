"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { VoiceNoteRecorder } from "@/components/jobs/voice-note-recorder";
import { apiCreateJob } from "@/lib/jobs/client";
import type { JobMedia } from "@/lib/jobs/types";
import { compressImageFile } from "@/lib/image-compress";
import type { CalloutUrgencyKind } from "@/lib/callout/urgency";
import {
  nearestProDistanceKm,
  useAutoCalloutUrgency,
} from "@/lib/callout/use-auto-urgency";
import {
  canAdvanceText,
  composePlumberProblem,
  PLUMBER_FINAL_COPY,
  PLUMBER_MAX_PHOTOS,
  PLUMBER_MIN_PHOTOS,
  PLUMBER_PROPERTY_OPTIONS,
  PLUMBER_START_OPTIONS,
  plumberScreen,
  nextPlumberScreen,
} from "@/lib/plumber/question-tree";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/map/address-autocomplete";
import type { PickedLocation } from "@/components/map/location-picker-map";
import { clearSession, readSession, writeSession } from "@/lib/session-restore";

const URGENCY_CHIPS: {
  id: CalloutUrgencyKind;
  label: string;
  fee: string;
}[] = [
  {
    id: "normal",
    label: PLUMBER_FINAL_COPY.normal,
    fee: "1x · base + call-out",
  },
  {
    id: "emergency",
    label: PLUMBER_FINAL_COPY.emergency,
    fee: "1.25x · base + call-out",
  },
  {
    id: "remote",
    label: PLUMBER_FINAL_COPY.remote,
    fee: "1.35x · base + call-out",
  },
  {
    id: "night",
    label: PLUMBER_FINAL_COPY.night,
    fee: "1.5x · base + call-out",
  },
];

type FinalStep = "urgency" | "photos" | "voice" | "location" | "property";

const FLOW_SESSION_KEY = "ona-plumber-flow-session";
/** Guard against exceeding the ~5 MB sessionStorage quota with media data URLs. */
const FLOW_SESSION_MAX_BYTES = 3_000_000;

interface PlumberFlowSnapshot {
  stack: string[];
  answers: Record<string, string>;
  draft: string;
  urgency: CalloutUrgencyKind;
  photos: JobMedia[];
  voiceNote: JobMedia | null;
  landmark: string;
  extra: string;
  finalStep: FinalStep;
  pickedLoc: PickedLocation | null;
  propertyChoice: string | null;
}

export function PlumberHelpFlow({
  isLight,
  onExit,
}: {
  isLight: boolean;
  /** Called when the user backs out of the first step (closes the flow). */
  onExit?: () => void;
}) {
  const router = useRouter();
  const {
    location,
    userProfile,
    backendUserId,
    isAuthenticated,
    helpingSomeoneElse,
    helpingSomeoneLabel,
    visibleTechnicians,
  } = useApp();

  const [stack, setStack] = useState<string[]>(["start"]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const { urgency, setUrgency, restoreUrgency } = useAutoCalloutUrgency({
    unsafe: false,
    distanceKm: nearestProDistanceKm(visibleTechnicians, ["plumber"]),
  });
  const [photos, setPhotos] = useState<JobMedia[]>([]);
  const [voiceNote, setVoiceNote] = useState<JobMedia | null>(null);
  const [landmark, setLandmark] = useState(location.label || "");
  const [extra, setExtra] = useState("");
  const [finalStep, setFinalStep] = useState<FinalStep>("urgency");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [pickedLoc, setPickedLoc] = useState<PickedLocation | null>(null);
  const [propertyChoice, setPropertyChoice] = useState<string | null>(null);
  /** Refresh-restore: true once the saved session has been (or tried to be) applied. */
  const [hydrated, setHydrated] = useState(false);
  const restoredRef = useRef(false);
  const advanceTimerRef = useRef<number | null>(null);

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearAdvanceTimer();
  }, []);

  const step = stack[stack.length - 1] || "start";
  const screen = plumberScreen(step);
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/50";
  const field = isLight
    ? "bg-transparent text-slate-900 placeholder:text-slate-400"
    : "bg-transparent text-white placeholder:text-white/40";
  const rowCard = isLight ? "bg-black/[0.02]" : "bg-white/[0.02]";
  const actionFlat = isLight ? "text-slate-700" : "text-white/85";
  const chipIdle = isLight
    ? "bg-black/8 text-slate-700"
    : "bg-[#2c2c2e] text-white/75";

  useEffect(() => {
    setLandmark((prev) => prev || location.label || "");
  }, [location.label]);

  /** Refresh-restore: return the user to the exact step they were on. */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const snap = readSession<PlumberFlowSnapshot>(FLOW_SESSION_KEY);
    if (snap) {
      setStack(
        Array.isArray(snap.stack) && snap.stack.length ? snap.stack : ["start"],
      );
      setAnswers(snap.answers ?? {});
      setDraft(snap.draft ?? "");
      if (snap.urgency) restoreUrgency(snap.urgency);
      setPhotos(snap.photos ?? []);
      setVoiceNote(snap.voiceNote ?? null);
      setLandmark(snap.landmark || location.label || "");
      setExtra(snap.extra ?? "");
      if (snap.finalStep) setFinalStep(snap.finalStep);
      setPickedLoc(snap.pickedLoc ?? null);
      setPropertyChoice(snap.propertyChoice ?? null);
      setDir("fwd");
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Keep the session snapshot fresh so a refresh restores this exact step. */
  useEffect(() => {
    if (!hydrated) return;
    const snap: PlumberFlowSnapshot = {
      stack,
      answers,
      draft,
      urgency,
      photos,
      voiceNote,
      landmark,
      extra,
      finalStep,
      pickedLoc,
      propertyChoice,
    };
    const json = JSON.stringify(snap);
    if (json.length > FLOW_SESSION_MAX_BYTES) {
      writeSession(FLOW_SESSION_KEY, { ...snap, photos: [], voiceNote: null });
    } else {
      writeSession(FLOW_SESSION_KEY, snap);
    }
  }, [
    hydrated,
    stack,
    answers,
    draft,
    urgency,
    photos,
    voiceNote,
    landmark,
    extra,
    finalStep,
    pickedLoc,
    propertyChoice,
  ]);

  /** Closing the flow intentionally forgets the saved position. */
  const handleExit = () => {
    clearSession(FLOW_SESSION_KEY);
    onExit?.();
  };

  const push = (next: string) => {
    setDir("fwd");
    setError(null);
    setStack((prev) => [...prev, next]);
  };

  const pick = (optionId: string, label: string) => {
    const nextAnswers = {
      ...answers,
      [step]: optionId,
      [`${step}_label`]: label,
    };
    setAnswers(nextAnswers);
    push(nextPlumberScreen(step, optionId, nextAnswers));
  };

  const submitText = () => {
    if (!canAdvanceText(draft)) {
      setError("A few words is enough.");
      return;
    }
    const nextAnswers = {
      ...answers,
      [step]: draft.trim(),
      [`${step}_label`]: draft.trim(),
    };
    setAnswers(nextAnswers);
    setDraft("");
    push(nextPlumberScreen(step, draft.trim(), nextAnswers));
  };

  const goBack = () => {
    if (stack.length <= 1) return;
    setError(null);
    setDir("back");
    const prev = stack[stack.length - 2];
    const leaving = stack[stack.length - 1];
    setStack((s) => s.slice(0, -1));
    if (plumberScreen(leaving)?.kind === "text") {
      setDraft(answers[leaving] || "");
    } else {
      setDraft(
        answers[prev] && plumberScreen(prev)?.kind === "text"
          ? answers[prev]
          : "",
      );
    }
  };

  const onPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = PLUMBER_MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError("You can add up to 4 photos.");
      return;
    }
    setError(null);
    try {
      const next: JobMedia[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const dataUrl = await compressImageFile(file, { maxEdge: 1280 });
        next.push({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          kind: "photo",
          url: dataUrl,
          name: file.name,
          mime: file.type,
          createdAt: new Date().toISOString(),
          uploadedBy: backendUserId || userProfile?.identityId || "guest",
        });
      }
      const total = photos.length + next.length;
      setPhotos((prev) => [...prev, ...next].slice(0, PLUMBER_MAX_PHOTOS));
      clearAdvanceTimer();
      if (total >= PLUMBER_MIN_PHOTOS) {
        advanceTimerRef.current = window.setTimeout(() => {
          advanceTimerRef.current = null;
          setFinalStep((prev) => (prev === "photos" ? "voice" : prev));
        }, 1000);
      }
    } catch {
      setError("Could not process photo.");
    }
  };

  const send = async () => {
    if (!isAuthenticated) {
      router.push("/login/role");
      return;
    }
    const motoristId = backendUserId || userProfile?.identityId || "";
    if (!motoristId) {
      router.push("/login/role");
      return;
    }
    const propertyLabel =
      PLUMBER_PROPERTY_OPTIONS.find((o) => o.id === propertyChoice)?.label ||
      propertyChoice ||
      "";
    const problem = [
      propertyLabel ? `Type of property: ${propertyLabel}` : "",
      composePlumberProblem(answers, extra, landmark),
    ]
      .filter(Boolean)
      .join("\n");
    const payload = {
      motoristId,
      motoristName: userProfile?.fullName || "Customer",
      motoristPhoto: userProfile?.avatarUrl || null,
      serviceType: "plumber" as const,
      motoristVehicle: null,
      problem,
      emergency: urgency === "emergency",
      calloutUrgency: urgency,
      currency: "NGN",
      locationLabel: pickedLoc?.label
        ? pickedLoc.label
        : helpingSomeoneElse
          ? helpingSomeoneLabel || landmark || location.label
          : landmark.trim() || location.label,
      lat: pickedLoc?.lat ?? location.coordinates.lat,
      lng: pickedLoc?.lng ?? location.coordinates.lng,
      photos,
      voiceNote,
    };
    setError(null);
    // Instant paint: hand the payload to /jobs/new (optimistic) and create the
    // job there in the background. Fall back to POST-first if the payload can't
    // be stashed (e.g. sessionStorage quota).
    let preloaded = false;
    try {
      window.sessionStorage.setItem("ona-new-request", JSON.stringify(payload));
      preloaded = true;
    } catch {
      /* fall through to POST-first */
    }
    if (preloaded) {
      clearSession(FLOW_SESSION_KEY);
      router.replace("/jobs/new");
      return;
    }
    setBusy(true);
    const res = await apiCreateJob(payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.message || "Could not send. Try again.");
      return;
    }
    try {
      window.sessionStorage.setItem(
        `ona-seed-job:${res.data.job.id}`,
        JSON.stringify(res.data.job),
      );
    } catch {
      /* ignore */
    }
    router.replace(`/jobs/${res.data.job.id}`);
    clearSession(FLOW_SESSION_KEY);
  };

  const nextFinal = () => {
    clearAdvanceTimer();
    setError(null);
    setFinalStep(
      finalStep === "urgency"
        ? "photos"
        : finalStep === "photos"
          ? "voice"
          : finalStep === "voice"
            ? "location"
            : "property",
    );
  };

  const finalBack = () => {
    clearAdvanceTimer();
    setError(null);
    if (finalStep === "urgency") {
      goBack();
      return;
    }
    setFinalStep(
      finalStep === "photos"
        ? "urgency"
        : finalStep === "voice"
          ? "photos"
          : finalStep === "location"
            ? "voice"
            : "location",
    );
  };

  const photosIncomplete = photos.length < PLUMBER_MIN_PHOTOS;
  const plumberSendDisabled =
    finalStep === "property" && propertyChoice === null;

  useEffect(() => {
    if (step === "final" && finalStep === "location" && pickedLoc) {
      clearAdvanceTimer();
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        void send();
      }, 2000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, finalStep, pickedLoc]);

  return (
    <div
      className={cn(
        "om-mech-enter flex h-full min-h-0 flex-col overflow-hidden rounded-t-lg px-3 pb-2 pt-1.5",
        isLight ? "bg-[#d8dce4]/90 backdrop-blur-sm" : "bg-black",
      )}
    >
      <div className="mb-1.5 h-0.5 shrink-0 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-brand"
          style={{
            width: `${(() => {
              const INDEX: Record<string, number> = {
                urgency: 0,
                photos: 1,
                voice: 2,
                location: 3,
                property: 4,
              };
              const N = 5;
              const DEFAULT_TOTAL = 11;
              const base = Math.max(0, stack.length - 1);
              const atFinal = step === "final";
              const pos = atFinal ? base + (INDEX[finalStep] ?? 0) : base;
              const total = atFinal ? base + N - 1 : DEFAULT_TOTAL;
              return Math.min(100, (pos / total) * 100);
            })()}%`,
          }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {step === "final" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
              <p
                className={cn(
                  "mt-2 px-0.5 pb-2 text-[14px] font-bold capitalize leading-snug",
                  ink,
                )}
              >
                {finalStep === "urgency"
                  ? PLUMBER_FINAL_COPY.urgency
                  : finalStep === "photos"
                    ? PLUMBER_FINAL_COPY.photos
                    : finalStep === "voice"
                      ? PLUMBER_FINAL_COPY.voice
                      : finalStep === "location"
                        ? PLUMBER_FINAL_COPY.location
                        : PLUMBER_FINAL_COPY.property}
              </p>
              <div className={cn("rounded-[4px] px-3 py-2.5", rowCard)}>
                {finalStep === "urgency" ? (
                  <div className="flex flex-col gap-1.5">
                    {URGENCY_CHIPS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setUrgency(opt.id);
                          setError(null);
                          nextFinal();
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md border-0 px-3 py-2.5 text-left transition-transform duration-150 active:scale-[0.985]",
                          urgency === opt.id
                            ? "bg-[#FF6B35]/10"
                            : "bg-transparent",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[13px] font-bold",
                            urgency === opt.id ? "text-[#FF6B35]" : ink,
                          )}
                        >
                          {opt.label}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] font-semibold",
                            urgency === opt.id ? "text-[#FF6B35]" : muted,
                          )}
                        >
                          {opt.fee}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {finalStep === "photos" ? (
                  <div>
                    <div className="mb-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={nextFinal}
                        aria-label="Next"
                        className="border-0 bg-transparent p-1 text-[#FF6B35]"
                      >
                        <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
                      </button>
                      <p className={cn("text-[12px] font-medium", muted)}>
                        {PLUMBER_FINAL_COPY.photos}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {photos.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setPhotos((prev) =>
                              prev.filter((x) => x.id !== p.id),
                            )
                          }
                          className="h-12 w-12 overflow-hidden rounded-lg border-0 p-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            loading="lazy"
                            decoding="async"
                            src={p.url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                      {photos.length < PLUMBER_MAX_PHOTOS ? (
                        <button
                          type="button"
                          onClick={() => photoRef.current?.click()}
                          className={cn(
                            "h-12 w-12 rounded-lg border-0 text-[18px] font-bold",
                            chipIdle,
                          )}
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void onPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                ) : null}
                {finalStep === "voice" ? (
                  <VoiceNoteRecorder
                    value={voiceNote}
                    onChange={setVoiceNote}
                    userId={backendUserId || userProfile?.identityId || "guest"}
                    isLight={isLight}
                    leading={
                      <button
                        type="button"
                        onClick={nextFinal}
                        aria-label="Next"
                        className="border-0 bg-transparent p-1 text-[#FF6B35]"
                      >
                        <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
                      </button>
                    }
                  />
                ) : null}
                {finalStep === "location" ? (
                  <div>
                    <div className="mb-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={nextFinal}
                        aria-label="Next"
                        className="border-0 bg-transparent p-1 text-[#FF6B35]"
                      >
                        <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
                      </button>
                      <p className={cn("text-[12px] font-medium", muted)}>
                        {PLUMBER_FINAL_COPY.location}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <AddressAutocomplete
                        className="-mx-3"
                        value={pickedLoc}
                        onChange={(loc) => {
                          setPickedLoc(loc);
                          setLandmark(loc.label || landmark);
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {finalStep === "property" ? (
                  <div>
                    <p
                      className={cn(
                        "text-[13px] font-semibold leading-snug",
                        ink,
                      )}
                    >
                      {PLUMBER_FINAL_COPY.property}
                    </p>
                    {propertyChoice === null ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {PLUMBER_PROPERTY_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setPropertyChoice(opt.id);
                              setError(null);
                            }}
                            className={cn(
                              "h-11 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]",
                              chipIdle,
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={cn("text-[13px] font-bold", ink)}>
                          {propertyChoice === "other"
                            ? "Other property type"
                            : (PLUMBER_PROPERTY_OPTIONS.find(
                                (o) => o.id === propertyChoice,
                              )?.label ?? propertyChoice)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPropertyChoice(null)}
                          className={cn(
                            "border-0 text-[13px] font-bold",
                            actionFlat,
                          )}
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              {error ? (
                <p className="mt-1 text-[12px] font-semibold text-red-500">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2 pt-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={finalBack}
                  className={cn(
                    "h-11 flex-1 rounded-md border-0 text-[14px] font-bold",
                    actionFlat,
                  )}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || plumberSendDisabled || photosIncomplete}
                  onClick={() => void send()}
                  className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Finding help…" : "Find a Repair Pro"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              key={`${step}-${dir}`}
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide",
                dir === "back" ? "om-mech-slide-back" : "om-mech-slide-fwd",
              )}
            >
              {screen ? (
                <>
                  <div className="mt-2 flex items-center gap-1 px-0.5 pb-2">
                    {screen?.kind === "text" ? (
                      <button
                        type="button"
                        disabled={!canAdvanceText(draft)}
                        onClick={submitText}
                        aria-label="Next"
                        className="border-0 bg-transparent p-0.5 text-[#FF6B35] disabled:opacity-40"
                      >
                        <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
                      </button>
                    ) : null}
                    <p
                      className={cn(
                        "text-[14px] font-bold capitalize leading-snug",
                        ink,
                      )}
                    >
                      {screen.question}
                    </p>
                  </div>
                  {screen.kind === "choice" ? (
                    <div className="flex flex-col gap-1">
                      {(screen.options || []).map((opt, i) => {
                        const letter =
                          step === "start"
                            ? PLUMBER_START_OPTIONS[i]?.id
                            : undefined;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => pick(opt.id, opt.label)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-[4px] border-0 px-1 py-3 text-left transition-transform duration-150 active:scale-[0.985]",
                              rowCard,
                            )}
                          >
                            {letter ? (
                              <span
                                className={cn(
                                  "w-5 shrink-0 text-[12px] font-bold",
                                  muted,
                                )}
                              >
                                {letter}.
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                "min-w-0 flex-1 text-[13px] font-semibold capitalize leading-snug",
                                ink,
                              )}
                            >
                              {opt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        setError(null);
                      }}
                      rows={3}
                      placeholder={screen.placeholder}
                      className={cn(
                        "w-full resize-none rounded-xl border-0 px-3 py-2 text-[13px] font-medium leading-snug outline-none",
                        field,
                      )}
                    />
                  )}
                </>
              ) : null}

              {error ? (
                <p className="mt-1 text-[12px] font-semibold text-red-500">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="mt-auto flex shrink-0 gap-2 pt-2">
              <button
                type="button"
                onClick={() => (stack.length > 1 ? goBack() : handleExit())}
                className={cn(
                  "h-11 w-full rounded-md border-0 text-[14px] font-bold",
                  actionFlat,
                )}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
