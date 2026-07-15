"use client";

/**
 * Describe the problem — modern, flat, fully scrollable.
 * Optional voice + up to 6 photos.
 */

import { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ImagePlus, X } from "lucide-react";
import { VoiceNoteRecorder } from "@/components/jobs/voice-note-recorder";
import { JobShell } from "@/components/jobs/job-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { compressImageFile } from "@/lib/image-compress";
import { apiCreateJob } from "@/lib/jobs/client";
import type { JobMedia } from "@/lib/jobs/types";
import {
  detectCurrency,
  formatMoney,
  getBaseLabourPrice,
  LABOUR_FEE_DISCLAIMER,
} from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 6;

function RequestInner() {
  const router = useRouter();
  const params = useSearchParams();
  const techId = params.get("tech");
  const {
    technicians,
    visibleTechnicians,
    theme,
    userProfile,
    location,
    backendUserId,
    helpingSomeoneElse,
    helpingSomeoneLabel,
  } = useApp();
  const isLight = theme === "light";
  const fileRef = useRef<HTMLInputElement>(null);

  const tech = useMemo(() => {
    if (techId) return technicians.find((t) => t.id === techId);
    return (
      visibleTechnicians.find((t) => t.status === "available") ??
      visibleTechnicians[0]
    );
  }, [techId, technicians, visibleTechnicians]);

  const [problem, setProblem] = useState("");
  const [voice, setVoice] = useState<JobMedia | null>(null);
  const [photos, setPhotos] = useState<JobMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currency = detectCurrency({
    countryName: userProfile?.servedCountry,
  });
  const base =
    tech && tech.servicePrices
      ? getBaseLabourPrice(tech.servicePrices, tech.serviceType)
      : null;

  const userId =
    backendUserId ||
    userProfile?.identityId ||
    userProfile?.email ||
    "motorist-local";

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";
  const field = isLight
    ? "bg-black/10 text-slate-900 placeholder:text-slate-500"
    : "bg-white/10 text-white placeholder:text-white/40";

  const onPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const list = Array.from(files).slice(0, room);
    setError(null);
    try {
      const next: JobMedia[] = [];
      for (const file of list) {
        const dataUrl = await compressImageFile(file, { maxEdge: 1280 });
        next.push({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          kind: "photo",
          url: dataUrl,
          name: file.name,
          mime: file.type,
          createdAt: new Date().toISOString(),
          uploadedBy: userId,
        });
      }
      setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
    } catch {
      setError("Could not process photo.");
    }
  };

  const send = async () => {
    if (!tech) {
      setError("Select a Repair Pro first.");
      return;
    }
    if (problem.trim().length < 5) {
      setError("Describe the problem in a few words.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiCreateJob({
      motoristId: userId,
      motoristName: userProfile?.fullName || "Motorist",
      repairProId: tech.id,
      repairProName: tech.name,
      repairProPhoto: tech.photo,
      serviceType: tech.serviceType,
      problem: problem.trim(),
      voiceNote: voice,
      photos,
      currency,
      proBaseMajor: base,
      locationLabel: helpingSomeoneElse
        ? helpingSomeoneLabel || location.label
        : location.label,
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.replace(`/jobs/${res.data.job.id}`);
  };

  const grayBtn = cn(
    "inline-flex h-12 w-full items-center justify-center rounded-2xl border-0 text-[14px] font-bold transition active:scale-[0.99] disabled:opacity-50",
    isLight
      ? "bg-[#a8a9ae] text-slate-900"
      : "bg-[#2c2c2e] text-white"
  );

  if (!tech) {
    return (
      <JobShell
        isLight={isLight}
        title="Describe the problem"
        compactHeader
        onBack={() => router.push("/")}
        footer={
          <button
            type="button"
            onClick={() => router.push("/")}
            className={grayBtn}
          >
            Browse map
          </button>
        }
      >
        <p className={cn("py-8 text-[14px] font-semibold", muted)}>
          No Repair Pro selected. Go back and pick someone nearby.
        </p>
      </JobShell>
    );
  }

  return (
    <JobShell
      isLight={isLight}
      title="Describe the problem"
      subtitle={`${PRO_SERVICE_LABELS[tech.serviceType]}  ${tech.name}`}
      compactHeader
      onBack={() => router.back()}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className={grayBtn}
        >
          {busy ? "Sending…" : "Send request"}
        </button>
      }
    >
      {/* Pro row — flat, no card border */}
      <div className="mb-5 flex items-center gap-3">
        <Avatar className="h-11 w-11 rounded-full">
          <AvatarImage
            src={tech.photo || DEFAULT_VENDOR_PHOTO}
            className="object-cover"
          />
          <AvatarFallback>{avatarInitials(tech.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className={cn("truncate text-[15px] font-black", ink)}>
            {tech.name}
          </p>
          <p className={cn("text-[12px] font-medium", muted)}>
            {base != null
              ? `Labour from ${formatMoney(base, currency)}`
              : "Quote on request"}
          </p>
        </div>
      </div>

      {/* Problem */}
      <section className="mb-5">
        <label className={cn("mb-2 block text-[13px] font-bold", ink)}>
          What’s wrong?
        </label>
        <textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          rows={5}
          placeholder="e.g. Engine overheating on the expressway, steam from the bonnet"
          className={cn(
            "w-full resize-y rounded-2xl border-0 p-3.5 text-[15px] font-medium leading-relaxed outline-none",
            field
          )}
        />
        <p className={cn("mt-2 text-[11px] font-medium leading-snug", muted)}>
          {LABOUR_FEE_DISCLAIMER}
        </p>
      </section>

      {/* Voice — optional, no box */}
      <section className="mb-5">
        <VoiceNoteRecorder
          value={voice}
          onChange={setVoice}
          userId={userId}
          isLight={isLight}
        />
      </section>

      {/* Photos optional up to 6 */}
      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className={cn("text-[13px] font-bold", ink)}>
            Photos{" "}
            <span className={cn("font-medium", muted)}>
              optional · {photos.length}/{MAX_PHOTOS}
            </span>
          </p>
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 border-0 bg-transparent text-[12px] font-bold text-[#e07a3d]"
            >
              <ImagePlus className="h-4 w-4" />
              Add
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void onPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-0",
              field,
              muted
            )}
          >
            <Camera className="h-5 w-5" />
            <span className="text-[12px] font-semibold">
              Add up to {MAX_PHOTOS} photos
            </span>
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative h-20 w-20 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt=""
                  className="h-20 w-20 rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setPhotos((prev) => prev.filter((x) => x.id !== p.id))
                  }
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-0 bg-black/75 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-xl border-0",
                  field,
                  muted
                )}
              >
                <ImagePlus className="h-4 w-4" />
                <span className="text-[10px] font-bold">Add</span>
              </button>
            )}
          </div>
        )}
      </section>

      {error && (
        <p className="mb-2 text-center text-[12px] font-semibold text-red-500">
          {error}
        </p>
      )}
    </JobShell>
  );
}

export default function RequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm opacity-60">
          Loading…
        </div>
      }
    >
      <RequestInner />
    </Suspense>
  );
}
