"use client";

/**
 * Premium motorist request — describe problem, voice note, photos → create job.
 */

import { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ImagePlus, X } from "lucide-react";
import { VoiceNoteRecorder } from "@/components/jobs/voice-note-recorder";
import {
  CopperButton,
  JobCard,
  JobShell,
} from "@/components/jobs/job-shell";
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
    backendUserId || userProfile?.identityId || userProfile?.email || "motorist-local";

  const onPhoto = async (file: File) => {
    try {
      const dataUrl = await compressImageFile(file, { maxEdge: 1280 });
      setPhotos((prev) => [
        ...prev.slice(0, 4),
        {
          id: `photo_${Date.now()}`,
          kind: "photo",
          url: dataUrl,
          name: file.name,
          mime: file.type,
          createdAt: new Date().toISOString(),
          uploadedBy: userId,
        },
      ]);
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

  if (!tech) {
    return (
      <JobShell
        isLight={isLight}
        title="Describe the problem"
        onBack={() => router.push("/")}
      >
        <JobCard isLight={isLight}>
          <p className="text-[14px] font-semibold opacity-70">
            No Repair Pro selected. Go back and pick someone nearby.
          </p>
          <CopperButton className="mt-4" onClick={() => router.push("/")}>
            Browse map
          </CopperButton>
        </JobCard>
      </JobShell>
    );
  }

  return (
    <JobShell
      isLight={isLight}
      title="Describe the problem"
      subtitle={`${PRO_SERVICE_LABELS[tech.serviceType]} · ${tech.name}`}
      onBack={() => router.back()}
      footer={
        <CopperButton disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Send request"}
        </CopperButton>
      }
    >
      <JobCard isLight={isLight} className="mb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 rounded-2xl">
            <AvatarImage
              src={tech.photo || DEFAULT_VENDOR_PHOTO}
              className="object-cover"
            />
            <AvatarFallback>{avatarInitials(tech.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-[15px] font-black",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              {tech.name}
            </p>
            <p
              className={cn(
                "text-[12px] font-semibold",
                isLight ? "text-slate-500" : "text-white/50"
              )}
            >
              {base != null
                ? `Listed labour from ${formatMoney(base, currency)}`
                : "Quote on request"}
            </p>
          </div>
        </div>
      </JobCard>

      <JobCard isLight={isLight} className="mb-3">
        <label
          className={cn(
            "mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#e07a3d]"
          )}
        >
          What’s wrong?
        </label>
        <textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          rows={5}
          placeholder="e.g. Engine overheating on the expressway, steam from the bonnet…"
          className={cn(
            "w-full resize-none rounded-2xl border-0 p-3 text-[15px] font-medium leading-relaxed outline-none",
            isLight
              ? "bg-black/[0.04] text-slate-900 placeholder:text-slate-400"
              : "bg-white/[0.06] text-white placeholder:text-white/35"
          )}
        />
        <p
          className={cn(
            "mt-2 text-[11px]",
            isLight ? "text-slate-500" : "text-white/45"
          )}
        >
          {LABOUR_FEE_DISCLAIMER}
        </p>
      </JobCard>

      <div className="mb-3">
        <VoiceNoteRecorder
          value={voice}
          onChange={setVoice}
          userId={userId}
          isLight={isLight}
        />
      </div>

      <JobCard isLight={isLight} className="mb-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#e07a3d]">
            Photos (optional)
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 text-[12px] font-bold text-[#e07a3d]"
          >
            <ImagePlus className="h-4 w-4" />
            Add
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPhoto(f);
            e.target.value = "";
          }}
        />
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed",
              isLight
                ? "border-black/15 text-slate-500"
                : "border-white/20 text-white/50"
            )}
          >
            <Camera className="h-6 w-6" />
            <span className="text-[12px] font-semibold">
              Photo of damage or vehicle
            </span>
          </button>
        ) : (
          <div className="flex gap-2 overflow-x-auto">
            {photos.map((p) => (
              <div key={p.id} className="relative h-24 w-24 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt=""
                  className="h-24 w-24 rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setPhotos((prev) => prev.filter((x) => x.id !== p.id))
                  }
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </JobCard>

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
