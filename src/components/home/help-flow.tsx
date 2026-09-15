"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  formatVehicleLabel,
  JobVehicleStep,
  profileVehiclesOf,
} from "@/components/home/job-vehicle-step";
import { useApp } from "@/lib/store";
import type { MotoristVehicle, ProService } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/map/address-autocomplete";
import type { PickedLocation } from "@/components/map/location-picker-map";
import { clearSession, readSession, writeSession } from "@/lib/session-restore";
import type { HelpFlowConfig, BaseRoute, ExtraSnapshot } from "./help-flow-configs";

const FLOW_SESSION_MAX_BYTES = 3_000_000;

/* -------------------------------------------------------------------------- */
/*  Flow snapshot (common fields only – extra state merged via config)        */
/* -------------------------------------------------------------------------- */

interface FlowSnapshot {
  stack: string[];
  answers: Record<string, string>;
  vehicleLabel?: string;
  manualVehicles?: MotoristVehicle[];
  draft: string;
  route?: BaseRoute | null;
  chosenTrade?: ProService;
  urgency?: CalloutUrgencyKind;
  photos: JobMedia[];
  voiceNote: JobMedia | null;
  landmark: string;
  extra: string;
  finalStep: string;
  pickedLoc: PickedLocation | null;
  /** Extra trade-specific fields are spread at the top level. */
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface HelpFlowProps {
  isLight: boolean;
  onExit?: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function HelpFlow({
  config,
  isLight,
  onExit,
}: HelpFlowProps & { config: HelpFlowConfig }) {
  const router = useRouter();
  const {
    location,
    userProfile,
    backendUserId,
    isAuthenticated,
    helpingSomeoneElse,
    helpingSomeoneLabel,
    updateUserProfile,
    visibleTechnicians,
  } = useApp();

  /* ---- core state ------------------------------------------------------- */
  const [stack, setStack] = useState<string[]>(() =>
    config.hasVehicleStep ? ["vehicle"] : [...config.defaultStack],
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [photos, setPhotos] = useState<JobMedia[]>([]);
  const [voiceNote, setVoiceNote] = useState<JobMedia | null>(null);
  const [landmark, setLandmark] = useState(location.label || "");
  const [extra, setExtra] = useState("");
  const [finalStep, setFinalStep] = useState(config.finalSteps[0] ?? "urgency");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [pickedLoc, setPickedLoc] = useState<PickedLocation | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const restoredRef = useRef(false);
  const advanceTimerRef = useRef<number | null>(null);

  /* ---- vehicle state (only when hasVehicleStep) ------------------------- */
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [manualVehicles, setManualVehicles] = useState<MotoristVehicle[]>([]);

  /* ---- route state (only when resolveRoute provided) -------------------- */
  const [route, setRoute] = useState<BaseRoute | null>(null);
  const [chosenTrade, setChosenTrade] = useState<ProService>(
    config.defaultTrade,
  );

  /* ---- urgency ---------------------------------------------------------- */
  const { urgency, setUrgency, restoreUrgency } = useAutoCalloutUrgency({
    unsafe: config.computeUnsafe ? config.computeUnsafe(answers) : false,
    distanceKm: nearestProDistanceKm(visibleTechnicians, config.nearestProServices),
  });

  /* ---- extra trade-specific state (generic bag) ------------------------- */
  const [extraState, setExtraState] = useState<ExtraSnapshot>({});

  /* ---- helpers ---------------------------------------------------------- */
  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  useEffect(() => () => clearAdvanceTimer(), []);

  const step = stack[stack.length - 1] || "start";
  const screen = config.screen(step);

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

  /* ---- vehicle helpers -------------------------------------------------- */
  const profileVehicles = useMemo(
    () => profileVehiclesOf(userProfile),
    [userProfile],
  );
  const savedVehicles = useMemo(
    () => [
      ...profileVehicles,
      ...manualVehicles.filter(
        (mv) =>
          !profileVehicles.some(
            (pv) => formatVehicleLabel(pv) === formatVehicleLabel(mv),
          ),
      ),
    ],
    [profileVehicles, manualVehicles],
  );

  const saveVehicle = (v: MotoristVehicle): string | null => {
    setManualVehicles((prev) => [...prev, v]);
    if (userProfile) {
      updateUserProfile({ vehicles: [...(userProfile.vehicles ?? []), v] });
    }
    return null;
  };

  useEffect(() => {
    setLandmark((prev) => prev || location.label || "");
  }, [location.label]);

  /* ---- session restore -------------------------------------------------- */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const snap = readSession<FlowSnapshot>(config.sessionKey);
    if (snap) {
      const defaultStack = config.hasVehicleStep ? ["vehicle"] : [...config.defaultStack];
      setStack(
        Array.isArray(snap.stack) && snap.stack.length ? snap.stack : defaultStack,
      );
      setAnswers(snap.answers ?? {});
      if (config.hasVehicleStep) {
        setVehicleLabel((snap.vehicleLabel as string) ?? "");
        setManualVehicles((snap.manualVehicles as MotoristVehicle[]) ?? []);
      }
      setDraft(snap.draft ?? "");
      if (config.resolveRoute) {
        setRoute((snap.route as BaseRoute) ?? null);
        if (snap.chosenTrade) setChosenTrade(snap.chosenTrade as ProService);
      }
      if (snap.urgency) restoreUrgency(snap.urgency as CalloutUrgencyKind);
      setPhotos(snap.photos ?? []);
      setVoiceNote(snap.voiceNote ?? null);
      setLandmark((snap.landmark as string) || location.label || "");
      setExtra((snap.extra as string) ?? "");
      if (snap.finalStep) setFinalStep(snap.finalStep as string);
      setPickedLoc((snap.pickedLoc as PickedLocation) ?? null);
      // Restore extra trade-specific state
      if (config.restoreExtraSnapshot) {
        config.restoreExtraSnapshot(snap as ExtraSnapshot, setExtraState);
      }
      setDir("fwd");
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- session persist -------------------------------------------------- */
  useEffect(() => {
    if (!hydrated) return;
    const snap: FlowSnapshot = {
      stack,
      answers,
      draft,
      photos,
      voiceNote,
      landmark,
      extra,
      finalStep,
      pickedLoc,
    };
    if (config.hasVehicleStep) {
      snap.vehicleLabel = vehicleLabel;
      snap.manualVehicles = manualVehicles;
    }
    if (config.resolveRoute) {
      snap.route = route;
      snap.chosenTrade = chosenTrade;
    }
    snap.urgency = urgency;
    if (config.collectExtraSnapshot) {
      Object.assign(snap, config.collectExtraSnapshot(extraState));
    }
    const json = JSON.stringify(snap);
    if (json.length > FLOW_SESSION_MAX_BYTES) {
      writeSession(config.sessionKey, { ...snap, photos: [], voiceNote: null });
    } else {
      writeSession(config.sessionKey, snap);
    }
  }, [
    hydrated,
    stack,
    answers,
    draft,
    photos,
    voiceNote,
    landmark,
    extra,
    finalStep,
    pickedLoc,
    vehicleLabel,
    manualVehicles,
    route,
    chosenTrade,
    urgency,
    extraState,
  ]);

  /* ---- navigation ------------------------------------------------------- */
  const handleExit = () => {
    clearSession(config.sessionKey);
    onExit?.();
  };

  const push = (next: string, nextAnswers: Record<string, string>) => {
    if (config.onPush) {
      const handled = config.onPush(next, nextAnswers, {
        setStack,
        setAnswers,
        setExtraState,
        setChosenTrade,
        setFinalStep,
        route,
      });
      if (handled) return;
    }
    setDir("fwd");
    setError(null);
    if (config.resolveRoute && (next === "confirm" || next === "final")) {
      const resolved = config.resolveRoute(nextAnswers);
      setRoute(resolved);
      setChosenTrade(resolved.trade);
    }
    setStack((prev) => [...prev, next]);
  };

  const pick = (optionId: string, label: string) => {
    const nextAnswers = {
      ...answers,
      [step]: optionId,
      [`${step}_label`]: label,
    };
    setAnswers(nextAnswers);
    const next = config.nextScreen(step, optionId, nextAnswers);
    if (next) push(next, nextAnswers);
  };

  const submitText = () => {
    if (!config.canAdvanceText(draft)) {
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
    const next = config.nextScreen(step, draft.trim(), nextAnswers);
    if (next) push(next, nextAnswers);
  };

  const goBack = () => {
    if (stack.length <= 1) return;
    setError(null);
    setDir("back");
    const prev = stack[stack.length - 2];
    const leaving = stack[stack.length - 1];
    setStack((s) => s.slice(0, -1));
    if (config.screen(leaving)?.kind === "text") {
      setDraft((answers[leaving] as string) || "");
    } else {
      setDraft(
        answers[prev] && config.screen(prev)?.kind === "text"
          ? (answers[prev] as string)
          : "",
      );
    }
  };

  /* ---- photos ----------------------------------------------------------- */
  const onPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = config.maxPhotos - photos.length;
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
      setPhotos((prev) => [...prev, ...next].slice(0, config.maxPhotos));
      clearAdvanceTimer();
      if (total >= config.minPhotos) {
        advanceTimerRef.current = window.setTimeout(() => {
          advanceTimerRef.current = null;
          setFinalStep((prev) => (prev === "photos" ? "voice" : prev));
        }, 1000);
      }
    } catch {
      setError("Could not process photo.");
    }
  };

  /* ---- send ------------------------------------------------------------- */
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
    const { serviceType, problem, motoristVehicle, extraPayload } =
      config.buildPayload({
        answers,
        extra,
        landmark,
        vehicleLabel,
        photos,
        voiceNote,
        pickedLoc,
        urgency,
        extraState,
      });
    const payload = {
      motoristId,
      motoristName: userProfile?.fullName || "Customer",
      motoristPhoto: userProfile?.avatarUrl || null,
      serviceType,
      motoristVehicle: motoristVehicle || null,
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
      ...extraPayload,
    };
    setError(null);
    let preloaded = false;
    try {
      window.sessionStorage.setItem("ona-new-request", JSON.stringify(payload));
      preloaded = true;
    } catch {
      /* fall through */
    }
    if (preloaded) {
      clearSession(config.sessionKey);
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
    clearSession(config.sessionKey);
  };

  /* ---- confirm route ---------------------------------------------------- */
  const acceptRoute = (yes: boolean) => {
    if (config.onAcceptRoute) {
      const handled = config.onAcceptRoute(yes, {
        route,
        setChosenTrade,
        setFinalStep,
        setStack,
        setAnswers,
        setExtraState,
        setError,
      });
      if (handled) return;
    }
    if (!route || !config.applyConfirmChoice || !route.trade) return;
    setChosenTrade(config.applyConfirmChoice(route as BaseRoute & { trade: ProService }, yes));
    setDir("fwd");
    setFinalStep(config.finalSteps[0] ?? "urgency");
    setStack((s) => [...s, "final"]);
  };

  /* ---- final step navigation -------------------------------------------- */
  const nextFinal = () => {
    clearAdvanceTimer();
    setError(null);
    setFinalStep((prev) => {
      const idx = config.finalSteps.indexOf(prev);
      return idx >= 0 && idx < config.finalSteps.length - 1
        ? config.finalSteps[idx + 1]
        : prev;
    });
  };

  const finalBack = () => {
    clearAdvanceTimer();
    setError(null);
    if (finalStep === config.finalSteps[0]) {
      goBack();
      return;
    }
    setFinalStep((prev) => {
      const idx = config.finalSteps.indexOf(prev);
      return idx > 0 ? config.finalSteps[idx - 1] : prev;
    });
  };

  /* ---- send readiness --------------------------------------------------- */
  const canSend = config.computeCanSend
    ? config.computeCanSend({ finalStep, photos, extraState, answers })
    : photos.length >= config.minPhotos;

  /* ---- auto-advance on location pick ------------------------------------ */
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

  /* ---- progress bar ----------------------------------------------------- */
  const finalStepIndex = config.finalSteps.indexOf(finalStep);
  const progressIndex =
    step === "final" && finalStepIndex >= 0 ? finalStepIndex : -1;

  /* ====================================================================== */
  /*  Render                                                                 */
  /* ====================================================================== */
  return (
    <div
      className={cn(
        "om-mech-enter flex h-full min-h-0 flex-col overflow-hidden rounded-t-lg px-3 pb-2 pt-1.5",
        isLight ? "bg-[#d8dce4]/90 backdrop-blur-sm" : "bg-black",
      )}
    >
      {/* Progress bar */}
      <div className="mb-1.5 h-0.5 shrink-0 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-brand"
          style={{
            width: `${(() => {
              const N = config.finalSteps.length;
              const base = Math.max(0, stack.length - 1);
              const atFinal = step === "final";
              const pos = atFinal ? base + (progressIndex >= 0 ? progressIndex : 0) : base;
              const total = atFinal ? base + N - 1 : config.progressDefaultTotal;
              return Math.min(100, (pos / total) * 100);
            })()}%`,
          }}
        />
      </div>

      {/* Vehicle step */}
      {config.hasVehicleStep && step === "vehicle" ? (
        <JobVehicleStep
          isLight={isLight}
          vehicles={savedVehicles}
          label={vehicleLabel}
          onChange={(next) => {
            setVehicleLabel(next);
            setError(null);
          }}
          onPick={(next, vehicle) => {
            setVehicleLabel(next);
            setError(null);
            push("start", {
              ...answers,
              ...(vehicle?.powertrain ? { powertrain: vehicle.powertrain } : {}),
            });
          }}
          onSaveVehicle={saveVehicle}
          onBack={() => (stack.length > 1 ? goBack() : handleExit())}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Final step view */}
          {step === "final" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
                {/* Title */}
                <div className="mb-1 mt-2 flex items-center gap-1 px-0.5">
                  {finalStep !== "urgency" &&
                  finalStep !== config.finalSteps[config.finalSteps.length - 1] ? (
                    <button
                      type="button"
                      onClick={nextFinal}
                      disabled={
                        finalStep === "photos" && photos.length < config.minPhotos
                      }
                      aria-label="Next"
                      className="border-0 bg-transparent p-1 text-[#FF6B35] disabled:opacity-30"
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
                    {config.finalCopy[finalStep] ?? finalStep}
                  </p>
                </div>

                <div className={cn("rounded-[4px] px-3 py-2.5", rowCard)}>
                  {/* Urgency */}
                  {finalStep === "urgency" ? (
                    <div className="flex flex-col gap-1.5">
                      {config.urgencyChips.map((opt) => (
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

                  {/* Photos */}
                  {finalStep === "photos" ? (
                    <div>
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
                        {photos.length < config.maxPhotos ? (
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

                  {/* Voice */}
                  {finalStep === "voice" ? (
                    <VoiceNoteRecorder
                      value={voiceNote}
                      onChange={setVoiceNote}
                      userId={
                        backendUserId || userProfile?.identityId || "guest"
                      }
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

                  {/* Location */}
                  {finalStep === "location" ? (
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
                  ) : null}

                  {/* Extra final steps delegated to config */}
                  {!["urgency", "photos", "voice", "location"].includes(
                    finalStep,
                  ) && config.renderExtraFinalStep
                    ? config.renderExtraFinalStep({
                        finalStep,
                        extraState,
                        setExtraState,
                        setError,
                        answers,
                        isLight,
                        ink,
                        muted,
                        field,
                        rowCard,
                        chipIdle,
                        actionFlat,
                      })
                    : null}
                </div>

                {error ? (
                  <p className="mt-1 text-[12px] font-semibold text-red-500">
                    {error}
                  </p>
                ) : null}
              </div>

              {/* Footer buttons */}
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
                    disabled={busy || !canSend}
                    onClick={() => void send()}
                    className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white disabled:opacity-50"
                  >
                    {busy ? `${config.busyLabel}…` : config.sendLabel}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Question / confirm screen */}
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
                      {screen.kind === "text" ? (
                        <button
                          type="button"
                          disabled={!config.canAdvanceText(draft)}
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
                              ? (config.startOptions ?? [])[i]?.id
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

                {/* Confirm screen */}
                {step === "confirm" && route && config.confirmQuestion ? (
                  <div>
                    <p className={cn("text-[14px] font-bold", ink)}>
                      {config.confirmQuestion(chosenTrade)}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => acceptRoute(true)}
                        className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => acceptRoute(false)}
                        className={cn(
                          "h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]",
                          chipIdle,
                        )}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <p className="mt-1 text-[12px] font-semibold text-red-500">
                    {error}
                  </p>
                ) : null}
              </div>

              {/* Back button */}
              {stack.length > 1 ? (
                <div className="mt-auto flex shrink-0 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className={cn(
                      "h-11 w-full rounded-md border-0 text-[14px] font-bold",
                      actionFlat,
                    )}
                  >
                    Back
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
