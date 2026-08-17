"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { VoiceNoteRecorder } from "@/components/jobs/voice-note-recorder";
import { apiCreateJob } from "@/lib/jobs/client";
import type { JobMedia } from "@/lib/jobs/types";
import { compressImageFile } from "@/lib/image-compress";
import type { CalloutUrgencyKind } from "@/lib/callout/urgency";
import {
  applyConfirmChoice,
  canAdvanceText,
  canFindMechanicPro,
  composeMechanicProblem,
  confirmQuestion,
  MECHANIC_FINAL_COPY,
  MECHANIC_MAX_PHOTOS,
  MECHANIC_START_OPTIONS,
  mechanicScreen,
  nextMechanicScreen,
  resolveMechanicRoute,
  type MechanicRoute,
} from "@/lib/mechanic/question-tree";
import {
  canUseVehicleLabel,
  JobVehicleStep,
  profileVehiclesOf,
} from "@/components/home/job-vehicle-step";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

const URGENCY_CHIPS: { id: CalloutUrgencyKind; label: string }[] = [
  { id: "normal", label: MECHANIC_FINAL_COPY.normal },
  { id: "emergency", label: MECHANIC_FINAL_COPY.emergency },
  { id: "remote", label: MECHANIC_FINAL_COPY.remote },
  { id: "night", label: MECHANIC_FINAL_COPY.night },
];

export function MechanicHelpFlow({ isLight }: { isLight: boolean }) {
  const router = useRouter();
  const {
    location,
    userProfile,
    backendUserId,
    isAuthenticated,
    helpingSomeoneElse,
    helpingSomeoneLabel,
    setCategory,
  } = useApp();

  const [stack, setStack] = useState<string[]>(["vehicle"]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [draft, setDraft] = useState("");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [route, setRoute] = useState<MechanicRoute | null>(null);
  const [chosenTrade, setChosenTrade] = useState<ProService>("mechanic");
  const [urgency, setUrgency] = useState<CalloutUrgencyKind>("normal");
  const [photos, setPhotos] = useState<JobMedia[]>([]);
  const [voiceNote, setVoiceNote] = useState<JobMedia | null>(null);
  const [landmark, setLandmark] = useState(location.label || "");
  const [extra, setExtra] = useState("");
  const [wantTow, setWantTow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const step = stack[stack.length - 1] || "start";
  const screen = mechanicScreen(step);
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/50";
  const field = isLight
    ? "bg-transparent text-slate-900 placeholder:text-slate-400"
    : "bg-transparent text-white placeholder:text-white/40";
  const nextGray = isLight
    ? "bg-[#4a4d53] text-white"
    : "bg-[#5c5c60] text-white";
  const chipIdle = isLight
    ? "bg-black/8 text-slate-700"
    : "bg-[#2c2c2e] text-white/75";

  useEffect(() => {
    setLandmark((prev) => prev || location.label || "");
  }, [location.label]);

  const push = (next: string, nextAnswers: Record<string, string>) => {
    setDir("fwd");
    setError(null);
    if (next === "confirm" || next === "final") {
      const resolved = resolveMechanicRoute(nextAnswers);
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
    push(nextMechanicScreen(step, optionId, nextAnswers), nextAnswers);
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
    push(nextMechanicScreen(step, draft.trim(), nextAnswers), nextAnswers);
  };

  const goBack = () => {
    if (stack.length <= 1) return;
    setError(null);
    setDir("back");
    const prev = stack[stack.length - 2];
    const leaving = stack[stack.length - 1];
    setStack((s) => s.slice(0, -1));
    if (mechanicScreen(leaving)?.kind === "text") {
      setDraft(answers[leaving] || "");
    } else {
      setDraft(answers[prev] && mechanicScreen(prev)?.kind === "text"
        ? answers[prev]
        : "");
    }
  };

  const close = () => {
    setCategory("none");
  };

  const onPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MECHANIC_MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError("Add clear photos (minimum 2–3)");
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
      setPhotos((prev) => [...prev, ...next].slice(0, MECHANIC_MAX_PHOTOS));
    } catch {
      setError("Could not process photo.");
    }
  };

  const send = async () => {
    if (!canFindMechanicPro(photos.length)) {
      setError("Add clear photos (minimum 2–3)");
      return;
    }
    if (!isAuthenticated) {
      router.push("/login/role");
      return;
    }
    const motoristId = backendUserId || userProfile?.identityId || "";
    if (!motoristId) {
      router.push("/login/role");
      return;
    }
    const trade: ProService = wantTow ? "towing" : chosenTrade;
    const problem = [
      vehicleLabel ? `Vehicle: ${vehicleLabel}` : "",
      composeMechanicProblem(answers, extra, landmark),
    ]
      .filter(Boolean)
      .join("\n");
    setBusy(true);
    setError(null);
    const res = await apiCreateJob({
      motoristId,
      motoristName: userProfile?.fullName || "Customer",
      motoristPhoto: userProfile?.avatarUrl || null,
      serviceType: trade,
      motoristVehicle: vehicleLabel || null,
      problem,
      emergency: urgency === "emergency",
      calloutUrgency: urgency,
      currency: "NGN",
      locationLabel: helpingSomeoneElse
        ? helpingSomeoneLabel || landmark || location.label
        : landmark.trim() || location.label,
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
      photos,
      voiceNote,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message || "Could not send. Try again.");
      return;
    }
    router.replace(`/jobs/${res.data.job.id}`);
  };

  const acceptRoute = (yes: boolean) => {
    if (!route) return;
    setChosenTrade(applyConfirmChoice(route, yes));
    setDir("fwd");
    setStack((s) => [...s, "final"]);
  };

  return (
    <div
      className={cn(
        "om-mech-enter flex h-full min-h-0 flex-col overflow-hidden rounded-t-lg px-3 pb-2 pt-1.5",
        isLight ? "bg-[#d8dce4]/90 backdrop-blur-sm" : "bg-black"
      )}
    >
      <div className="flex shrink-0 items-center justify-end pb-1">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border-0",
            isLight ? "bg-black/8 text-slate-700" : "bg-white/10 text-white"
          )}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.4} />
        </button>
      </div>
      <div
        className={cn(
          "mb-1.5 h-0.5 shrink-0 overflow-hidden rounded-full",
          isLight ? "bg-black/10" : "bg-white/10"
        )}
      >
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{
            width: `${Math.min(100, (stack.length / 8) * 100)}%`,
          }}
        />
      </div>

      <div
        key={`${step}-${dir}`}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide",
          dir === "back" ? "om-mech-slide-back" : "om-mech-slide-fwd"
        )}
      >
        {step === "vehicle" ? (
          <JobVehicleStep
            isLight={isLight}
            vehicles={profileVehiclesOf(userProfile)}
            label={vehicleLabel}
            onChange={(next) => {
              setVehicleLabel(next);
              setError(null);
            }}
          />
        ) : null}

        {screen ? (
          <>
            <p className={cn("px-0.5 pb-2 text-[14px] font-bold leading-snug", ink)}>
              {screen.question}
            </p>
            {screen.kind === "choice" ? (
              <div className="flex flex-col">
                {(screen.options || []).map((opt, i) => {
                  const letter =
                    step === "start"
                      ? MECHANIC_START_OPTIONS[i]?.id
                      : undefined;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => pick(opt.id, opt.label)}
                      className={cn(
                        "flex w-full items-center gap-2 border-0 border-b bg-transparent px-1 py-2.5 text-left transition-transform duration-150 active:scale-[0.985]",
                        isLight ? "border-black/10" : "border-white/10"
                      )}
                    >
                      {letter ? (
                        <span
                          className={cn(
                            "w-5 shrink-0 text-[12px] font-bold",
                            muted
                          )}
                        >
                          {letter}.
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-[13px] font-semibold leading-snug",
                          ink
                        )}
                      >
                        {opt.label}
                      </span>
                      <ChevronRight
                        className={cn("h-4 w-4 shrink-0", muted)}
                        strokeWidth={2.2}
                      />
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
                  field
                )}
              />
            )}
          </>
        ) : null}

        {step === "confirm" && route ? (
          <div>
            <p className={cn("text-[14px] font-bold", ink)}>
              {confirmQuestion(route.trade)}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => acceptRoute(true)}
                className="rounded-full border-0 bg-brand px-4 py-2 text-[13px] font-bold text-white active:scale-[0.97]"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => acceptRoute(false)}
                className={cn(
                  "rounded-full border-0 px-4 py-2 text-[13px] font-bold active:scale-[0.97]",
                  chipIdle
                )}
              >
                No
              </button>
            </div>
          </div>
        ) : null}

        {step === "final" ? (
          <div className="space-y-2.5">
            <p className={cn("text-[13px] font-bold", ink)}>
              {MECHANIC_FINAL_COPY.urgency}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {URGENCY_CHIPS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUrgency(opt.id)}
                  className={cn(
                    "rounded-full border-0 px-3 py-1.5 text-[12px] font-bold",
                    urgency === opt.id ? "bg-brand text-white" : chipIdle
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <p className={cn("mb-1 text-[13px] font-bold", ink)}>
                {MECHANIC_FINAL_COPY.photos}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setPhotos((prev) => prev.filter((x) => x.id !== p.id))
                    }
                    className="h-12 w-12 overflow-hidden rounded-lg border-0 p-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
                {photos.length < MECHANIC_MAX_PHOTOS ? (
                  <button
                    type="button"
                    onClick={() => photoRef.current?.click()}
                    className={cn(
                      "h-12 w-12 rounded-lg border-0 text-[18px] font-bold",
                      chipIdle
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

            <div>
              <p className={cn("mb-1 text-[13px] font-bold", ink)}>
                {MECHANIC_FINAL_COPY.voice}
              </p>
              <VoiceNoteRecorder
                value={voiceNote}
                onChange={setVoiceNote}
                userId={backendUserId || userProfile?.identityId || "guest"}
                isLight={isLight}
              />
            </div>

            <label className={cn("block text-[13px] font-bold", ink)}>
              {MECHANIC_FINAL_COPY.location}
              <input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className={cn(
                  "mt-1 h-10 w-full rounded-xl border-0 px-3 text-[13px] font-medium outline-none",
                  field
                )}
              />
            </label>

            <label className={cn("block text-[13px] font-bold", ink)}>
              {MECHANIC_FINAL_COPY.extra}
              <textarea
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                rows={2}
                className={cn(
                  "mt-1 w-full resize-none rounded-xl border-0 px-3 py-2 text-[13px] font-medium outline-none",
                  field
                )}
              />
            </label>

            <div>
              <p className={cn("text-[13px] font-bold", ink)}>
                {MECHANIC_FINAL_COPY.tow}
              </p>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setWantTow(true)}
                  className={cn(
                    "rounded-full border-0 px-3 py-1.5 text-[12px] font-bold",
                    wantTow ? "bg-brand text-white" : chipIdle
                  )}
                >
                  {MECHANIC_FINAL_COPY.towYes}
                </button>
                <button
                  type="button"
                  onClick={() => setWantTow(false)}
                  className={cn(
                    "rounded-full border-0 px-3 py-1.5 text-[12px] font-bold",
                    !wantTow ? "bg-brand text-white" : chipIdle
                  )}
                >
                  {MECHANIC_FINAL_COPY.towNo}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1 shrink-0 text-[12px] font-semibold text-red-500">
          {error}
        </p>
      ) : null}

      <div className="mt-auto flex shrink-0 gap-2 pt-2">
        {stack.length > 1 ? (
          <button
            type="button"
            onClick={goBack}
            className={cn(
              "h-11 flex-1 rounded-md border-0 text-[14px] font-bold",
              nextGray
            )}
          >
            Back
          </button>
        ) : null}
        {step === "vehicle" ? (
          <button
            type="button"
            disabled={!canUseVehicleLabel(vehicleLabel)}
            onClick={() => {
              setError(null);
              push("start", answers);
            }}
            className={cn(
              "h-11 flex-1 rounded-md border-0 text-[14px] font-bold disabled:opacity-50",
              nextGray
            )}
          >
            Next
          </button>
        ) : null}
        {screen?.kind === "text" ? (
          <button
            type="button"
            disabled={!canAdvanceText(draft)}
            onClick={submitText}
            className={cn(
              "h-11 flex-1 rounded-md border-0 text-[14px] font-bold disabled:opacity-50",
              nextGray
            )}
          >
            Next
          </button>
        ) : null}
        {step === "final" ? (
          <button
            type="button"
            disabled={busy || !canFindMechanicPro(photos.length)}
            onClick={() => void send()}
            className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "Finding help…" : "Find a Repair Pro"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
