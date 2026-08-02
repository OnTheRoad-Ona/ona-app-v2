"use client";

/**
 * Describe the problem — modern, flat, fully scrollable.
 * Optional voice + up to 6 photos.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ImagePlus, X } from "lucide-react";
import { VoiceNoteRecorder } from "@/components/jobs/voice-note-recorder";
import { JobShell } from "@/components/jobs/job-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { compressImageFile } from "@/lib/image-compress";
import { apiCreateJob } from "@/lib/jobs/client";
import type { JobMedia } from "@/lib/jobs/types";
import { showsVehicleOnRequest } from "@/lib/artisan/catalog";
import {
  detectCurrency,
  formatMoney,
  getBaseLabourPrice,
  labourFeeDisclaimerForTrade,
  problemPlaceholderForTrade,
  type AppCurrency,
} from "@/lib/pricing";
import { requiresBankSetup } from "@/lib/bank-details";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
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

  const profileVehicles = useMemo(() => {
    const list = userProfile?.vehicles?.filter(
      (v) => v.make || v.model || v.vehicleType
    );
    if (list?.length) return list;
    if (userProfile?.vehicleMake || userProfile?.vehicleModel) {
      return [
        {
          id: "primary",
          vehicleType: undefined,
          make: userProfile.vehicleMake || "",
          model: userProfile.vehicleModel || "",
          year: userProfile.vehicleYear,
        },
      ];
    }
    return [];
  }, [userProfile]);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");

  useEffect(() => {
    if (!profileVehicles.length) {
      setSelectedVehicleId("");
      return;
    }
    setSelectedVehicleId((prev) =>
      prev && profileVehicles.some((v) => v.id === prev)
        ? prev
        : profileVehicles[0].id
    );
  }, [profileVehicles]);

  const selectedVehicleLabel = useMemo(() => {
    const v = profileVehicles.find((x) => x.id === selectedVehicleId);
    if (!v) return null;
    return [v.vehicleType, v.make, v.model, v.year].filter(Boolean).join(" ");
  }, [profileVehicles, selectedVehicleId]);
  // Prefer currency from profile / pro pricing (signup market) — never force GBP from browser locale
  const [currency, setCurrency] = useState<AppCurrency>(() => {
    const fromProfile = userProfile?.pricingCurrency;
    if (
      fromProfile === "NGN" ||
      fromProfile === "USD" ||
      fromProfile === "GBP" ||
      fromProfile === "ZAR" ||
      fromProfile === "GHS" ||
      fromProfile === "KES" ||
      fromProfile === "EUR"
    ) {
      return fromProfile;
    }
    return detectCurrency({
      countryName:
        userProfile?.servedCountry ||
        userProfile?.city ||
        location.city ||
        "Nigeria",
      countryCode: "NG",
    });
  });

  useEffect(() => {
    const techCur = tech?.pricingCurrency;
    if (
      techCur === "NGN" ||
      techCur === "USD" ||
      techCur === "GBP" ||
      techCur === "ZAR" ||
      techCur === "GHS" ||
      techCur === "KES" ||
      techCur === "EUR"
    ) {
      setCurrency(techCur);
      return;
    }
    const fromProfile = userProfile?.pricingCurrency;
    if (
      fromProfile === "NGN" ||
      fromProfile === "USD" ||
      fromProfile === "GBP" ||
      fromProfile === "ZAR" ||
      fromProfile === "GHS" ||
      fromProfile === "KES" ||
      fromProfile === "EUR"
    ) {
      setCurrency(fromProfile);
      return;
    }
    // Default marketplace Nigeria unless profile/geo clearly elsewhere
    setCurrency(
      detectCurrency({
        countryName:
          userProfile?.servedCountry || userProfile?.city || "Nigeria",
        countryCode: "NG",
      })
    );
  }, [tech?.pricingCurrency, userProfile?.pricingCurrency, userProfile?.servedCountry, userProfile?.city]);

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
    if (userProfile && requiresBankSetup(userProfile)) {
      setError("Please complete your bank account setup before requesting assistance.");
      return;
    }
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
    let res;
    try {
      // Resolve motoristId from live session so it always matches requireUser
      let motoristId = userId;
      try {
        const { ensureAppSession } = await import("@/lib/supabase/session");
        const session = await ensureAppSession({ waitForSessionMs: 2500 });
        if (session?.userId) motoristId = session.userId;
      } catch {
        /* keep store userId */
      }
      if (
        !motoristId ||
        motoristId === "motorist-local" ||
        motoristId === "local-user"
      ) {
        setBusy(false);
        setError("Please sign in again to request a Repair Pro.");
        return;
      }
      res = await apiCreateJob({
        motoristId,
        motoristName: userProfile?.fullName || "Customer",
        motoristPhoto: userProfile?.avatarUrl || null,
        motoristVehicle:
          tech &&
          showsVehicleOnRequest(
            tech.serviceType as ProService,
            tech.specialties
          )
            ? selectedVehicleLabel || null
            : null,
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
    } catch {
      setBusy(false);
      setError("Network error. Please try again.");
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      try {
        const { playAppSound } = await import("@/lib/sound-tone");
        playAppSound("error");
      } catch {
        /* */
      }
      return;
    }
    // Discovery: demote this pro 50% radius priority; hide while job is active
    try {
      const { recordBookedPro } = await import(
        "@/lib/jobs/booked-pro-priority"
      );
      recordBookedPro(tech.id);
    } catch {
      /* */
    }
    try {
      const { playAppSound } = await import("@/lib/sound-tone");
      playAppSound("success_soft");
    } catch {
      /* */
    }
    router.replace(`/jobs/${res.data.job.id}`);
  };

  const grayBtn = cn(
    "inline-flex h-12 w-full items-center justify-center rounded-md border-0 text-[14px] font-bold transition active:scale-[0.99] disabled:opacity-50",
    isLight
      ? "bg-[#c8c9cd] text-slate-900 ring-1 ring-black/10"
      : "bg-[#2c2c2e] text-white"
  );

  if (!tech) {
    return (
      <JobShell
        isLight={isLight}
        title="Describe the problem"
        compactHeader
        onBack={() => router.push("/dashboard")}
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
      compactHeader
      onBack={() => router.push("/dashboard")}
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
            {PRO_SERVICE_LABELS[tech.serviceType] ?? tech.roleLabel ?? tech.serviceType}
            {base != null ? (
              <>
                <span className="mx-1 opacity-40">·</span>
                <span className="font-bold text-brand">
                  {formatMoney(base, currency)}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Vehicle only for auto trades / vehicle AC-Electric specialty */}
      {profileVehicles.length > 0 &&
      showsVehicleOnRequest(
        tech.serviceType as ProService,
        tech.specialties
      ) ? (
        <section className="mb-5">
          <label className={cn("mb-2 block text-[13px] font-bold", ink)}>
            Which vehicle needs help?
          </label>
          {profileVehicles.length === 1 ? (
            <p className={cn("text-[14px] font-semibold", ink)}>
              {selectedVehicleLabel}
            </p>
          ) : (
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className={cn(
                "h-11 w-full rounded-xl border-0 px-3.5 text-[14px] font-semibold outline-none",
                field
              )}
            >
              {profileVehicles.map((v) => {
                const label = [v.vehicleType, v.make, v.model, v.year]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <option key={v.id} value={v.id}>
                    {label || "Vehicle"}
                  </option>
                );
              })}
            </select>
          )}
        </section>
      ) : null}

      {/* Problem */}
      <section className="mb-5">
        <label className={cn("mb-2 block text-[13px] font-bold", ink)}>
          What’s wrong?
        </label>
        <textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          rows={5}
          placeholder={problemPlaceholderForTrade(tech.serviceType)}
          className={cn(
            "w-full resize-y rounded-2xl border-0 p-3.5 text-[15px] font-medium leading-relaxed outline-none",
            field
          )}
        />
        <p className={cn("mt-2 text-[11px] font-medium leading-snug", muted)}>
          {labourFeeDisclaimerForTrade(tech.serviceType)}
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
              className="inline-flex items-center gap-1 border-0 bg-transparent text-[12px] font-bold text-[#FF6B35]"
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
