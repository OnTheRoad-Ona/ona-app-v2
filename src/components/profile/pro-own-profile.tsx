"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Radio } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AchievementBadgesRow } from "@/components/profile/achievement-badges";
import { BioField } from "@/components/profile/bio-field";
import { FaceLiveness } from "@/components/profile/face-liveness";
import {
  ProfileSection,
  ProfileShell,
} from "@/components/profile/profile-shell";
import { RadiusMapPreview } from "@/components/profile/radius-map-preview";
import { SkillsChips } from "@/components/profile/skills-chips";
import {
  TierProgress,
  VerificationMark,
} from "@/components/profile/verification-mark";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { compressImageFile } from "@/lib/image-compress";
import {
  EXP_YEARS,
  formatExperience,
  hasVerificationMark,
  memberSinceLabel,
  profileTheme,
  SERVICE_RADIUS_OPTIONS_KM,
} from "@/lib/profile-system";
import { useApp } from "@/lib/store";
import { ServicePriceEditor } from "@/components/pricing/service-price-editor";
import {
  detectCurrency,
  type AppCurrency,
} from "@/lib/pricing";
import { isProService } from "@/lib/services";
import type { ProService, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 3. Repair Pro own profile — editable only by the pro.
 */
export function ProOwnProfile({ isLight }: { isLight: boolean }) {
  const router = useRouter();
  const {
    userProfile,
    updateUserProfile,
    proLive,
    setProLive,
    proServices,
  } = useApp();
  const t = profileTheme(isLight);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [showLiveness, setShowLiveness] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);

  const [fullName, setFullName] = useState(userProfile?.fullName || "");
  const [businessName, setBusinessName] = useState(
    userProfile?.businessName || ""
  );
  const [bio, setBio] = useState(userProfile?.bio || "");
  const [years, setYears] = useState(userProfile?.yearsExperience || "3");
  const [skills, setSkills] = useState<ProService[]>(
    (userProfile?.services || proServices || []).filter(isProService)
  );
  const [radiusKm, setRadiusKm] = useState(userProfile?.serviceRadiusKm ?? 10);
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatarUrl || "");
  const [bankName, setBankName] = useState(userProfile?.bankName || "");
  const [bankAccountName, setBankAccountName] = useState(
    userProfile?.bankAccountName || ""
  );
  const [bankAccountNumber, setBankAccountNumber] = useState(
    userProfile?.bankAccountNumber || ""
  );
  const [servicePrices, setServicePrices] = useState<
    Partial<Record<ProService, number | string>>
  >(userProfile?.servicePrices || {});
  const [pricingCurrency, setPricingCurrency] = useState<AppCurrency>(
    userProfile?.pricingCurrency ||
      detectCurrency({ countryName: userProfile?.servedCountry })
  );
  const [cacName, setCacName] = useState(userProfile?.cacDocumentName || "");
  const [cacData, setCacData] = useState(userProfile?.cacDocumentDataUrl || "");

  if (!userProfile || userProfile.accountType !== "professional") {
    return (
      <ProfileShell
        isLight={isLight}
        title="My Profile"
        error="Sign in as a Repair Pro to view this profile."
      />
    );
  }

  const jobs = userProfile.jobsCompleted ?? 0;
  const field = isLight
    ? "h-10 w-full border-0 border-b border-black/15 bg-transparent px-0 text-[13px] font-medium text-slate-900 outline-none"
    : "h-10 w-full rounded-xl border-0 bg-[#2c2c2e] px-3 text-[13px] font-medium text-white outline-none";

  const sync = (p: UserProfile) => {
    setFullName(p.fullName || "");
    setBusinessName(p.businessName || "");
    setBio(p.bio || "");
    setYears(p.yearsExperience || "3");
    setSkills((p.services || []).filter(isProService));
    setRadiusKm(p.serviceRadiusKm ?? 10);
    setAvatarUrl(p.avatarUrl || "");
    setBankName(p.bankName || "");
    setBankAccountName(p.bankAccountName || "");
    setBankAccountNumber(p.bankAccountNumber || "");
    setServicePrices(p.servicePrices || {});
    setPricingCurrency(
      p.pricingCurrency ||
        detectCurrency({ countryName: p.servedCountry })
    );
    setCacName(p.cacDocumentName || "");
    setCacData(p.cacDocumentDataUrl || "");
  };

  const save = () => {
    setErr(null);
    setMsg(null);
    // Keep prices only for selected skills
    const cleaned: Partial<Record<ProService, number | string>> = {};
    for (const s of skills) {
      if (servicePrices[s] != null && servicePrices[s] !== "") {
        cleaned[s] = servicePrices[s]!;
      }
    }
    const e = updateUserProfile({
      fullName: fullName.trim(),
      businessName: businessName.trim() || undefined,
      bio: bio.slice(0, 144) || undefined,
      yearsExperience: years,
      services: skills.length ? skills : userProfile.services,
      serviceRadiusKm: Math.min(100, Math.max(1, radiusKm)),
      avatarUrl: avatarUrl || undefined,
      bankName: bankName.trim() || undefined,
      bankAccountName: bankAccountName.trim() || undefined,
      bankAccountNumber: bankAccountNumber.trim() || undefined,
      servicePrices: cleaned,
      pricingCurrency,
      cacDocumentName: cacName || undefined,
      cacDocumentDataUrl: cacData || undefined,
    });
    if (e) {
      setErr(e);
      return;
    }
    setMsg("Profile saved.");
    setEditing(false);
  };

  const toggleLive = async () => {
    setLiveBusy(true);
    try {
      await setProLive(!proLive);
    } finally {
      setLiveBusy(false);
    }
  };

  return (
    <ProfileShell
      isLight={isLight}
      title="My Profile"
      showEdit={!editing}
      onEdit={() => {
        sync(userProfile);
        setEditing(true);
        setMsg(null);
        setErr(null);
      }}
      footer={
        editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                sync(userProfile);
              }}
              className={cn(
                "h-11 flex-1 rounded-xl border-0 text-[13px] font-bold",
                isLight ? "bg-black/8 text-slate-900" : "bg-[#2c2c2e] text-white"
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="h-11 flex-1 rounded-xl border-0 bg-[#323231] text-[13px] font-bold text-white"
            >
              Save
            </button>
          </div>
        ) : (
          <>
            <Button
              size="lg"
              className="h-11 w-full"
              onClick={() => {
                sync(userProfile);
                setEditing(true);
              }}
            >
              Edit Profile
            </Button>
            <Button
              size="lg"
              className="h-11 w-full"
              disabled={liveBusy}
              onClick={() => void toggleLive()}
            >
              <Radio className="h-4 w-4" />
              {proLive ? "Go Offline" : "Go Online"}
            </Button>
          </>
        )
      }
    >
      {(msg || err) && (
        <p
          className={cn(
            "mb-1 rounded-xl px-3 py-2 text-[12px] font-semibold",
            err ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-500"
          )}
        >
          {err || msg}
        </p>
      )}

      <ProfileSection isLight={isLight}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!editing}
            onClick={() => fileRef.current?.click()}
            className="relative shrink-0 border-0 bg-transparent p-0"
          >
            <Avatar className="h-16 w-16 overflow-hidden rounded-full">
              <AvatarImage
                src={avatarUrl || DEFAULT_VENDOR_PHOTO}
                alt={fullName}
                className="object-cover"
              />
              <AvatarFallback className="bg-brand font-bold text-white">
                {avatarInitials(fullName || userProfile.fullName)}
              </AvatarFallback>
            </Avatar>
            {editing && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
                <Camera className="h-3 w-3" />
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setAvatarUrl(await compressImageFile(f, { maxEdge: 512 }));
              } catch {
                setErr("Could not process image.");
              }
            }}
          />
          <div className="min-w-0 flex-1">
            {editing ? (
              <>
                <input
                  className={field}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                />
                <input
                  className={cn(field, "mt-1")}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Business / workshop name"
                />
              </>
            ) : (
              <>
                <p className={cn("flex items-center gap-1 text-[17px] font-black", t.ink)}>
                  <span className="truncate">{userProfile.fullName}</span>
                  <VerificationMark profile={userProfile} />
                </p>
                {userProfile.businessName && (
                  <p className={cn("text-[12px] font-semibold", t.soft)}>
                    {userProfile.businessName}
                  </p>
                )}
              </>
            )}
            <p className={cn("mt-1 text-[11px]", t.muted)}>
              Member since {memberSinceLabel(userProfile.registeredAt)}
            </p>
            <AchievementBadgesRow completedJobs={jobs} className="mt-1.5" />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
              proLive
                ? "bg-emerald-500/20 text-emerald-500"
                : isLight
                  ? "bg-black/10 text-slate-600"
                  : "bg-[#2c2c2e] text-white/60"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                proLive ? "bg-emerald-500" : "bg-slate-400"
              )}
            />
            {proLive ? "Online" : "Offline"}
          </span>
          {!editing && (
            <button
              type="button"
              disabled={liveBusy}
              onClick={() => void toggleLive()}
              className="text-[11px] font-bold text-brand"
            >
              {proLive ? "Go offline" : "Go online"}
            </button>
          )}
        </div>
      </ProfileSection>

      <ProfileSection title="Experience" isLight={isLight}>
        {editing ? (
          <select
            className={field}
            value={years}
            onChange={(e) => setYears(e.target.value)}
          >
            {EXP_YEARS.map((y) => (
              <option key={y} value={y}>
                {formatExperience(y)}
              </option>
            ))}
          </select>
        ) : (
          <p className={cn("text-[13px] font-semibold", t.ink)}>
            {formatExperience(userProfile.yearsExperience)}
          </p>
        )}
      </ProfileSection>

      <ProfileSection title="Skills" isLight={isLight}>
        <SkillsChips
          selected={editing ? skills : (userProfile.services || []).filter(isProService)}
          isLight={isLight}
          editable={editing}
          onToggle={(s) =>
            setSkills((prev) =>
              prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
            )
          }
        />
      </ProfileSection>

      <ProfileSection title="Labour prices" isLight={isLight}>
        <ServicePriceEditor
          skills={
            editing
              ? skills
              : (userProfile.services || []).filter(isProService)
          }
          prices={editing ? servicePrices : userProfile.servicePrices || {}}
          currency={
            editing
              ? pricingCurrency
              : userProfile.pricingCurrency ||
                detectCurrency({ countryName: userProfile.servedCountry })
          }
          countryName={userProfile.servedCountry}
          isLight={isLight}
          editing={editing}
          onChangeCurrency={setPricingCurrency}
          onChangePrice={(service, major) => {
            setServicePrices((prev) => {
              const next = { ...prev };
              if (major == null) delete next[service];
              else next[service] = major;
              return next;
            });
          }}
        />
      </ProfileSection>

      <ProfileSection title="Bio" isLight={isLight}>
        {editing ? (
          <BioField value={bio} onChange={setBio} isLight={isLight} />
        ) : (
          <p className={cn("text-[13px] leading-snug", t.soft)}>
            {(userProfile.bio || "No bio yet.").slice(0, 144)}
          </p>
        )}
      </ProfileSection>

      <ProfileSection title="Service radius" isLight={isLight}>
        {editing ? (
          <div className="flex flex-wrap gap-1.5">
            {SERVICE_RADIUS_OPTIONS_KM.map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => setRadiusKm(km)}
                className={cn(
                  "rounded-full border-0 px-3 py-1.5 text-[11px] font-bold",
                  radiusKm === km
                    ? "bg-brand text-white"
                    : isLight
                      ? "bg-black/8 text-slate-700"
                      : "bg-[#2c2c2e] text-white/75"
                )}
              >
                {km} km
              </button>
            ))}
          </div>
        ) : (
          <p className={cn("mb-2 text-[12px] font-semibold", t.ink)}>
            {userProfile.serviceRadiusKm ?? 10} km coverage
          </p>
        )}
        <RadiusMapPreview
          radiusKm={editing ? radiusKm : userProfile.serviceRadiusKm ?? 10}
          isLight={isLight}
          className="mt-2"
        />
      </ProfileSection>

      <ProfileSection title="Stats" isLight={isLight}>
        <div className="grid grid-cols-2 gap-1.5 text-center sm:grid-cols-4">
          {[
            ["Jobs", jobs],
            ["Rating", userProfile.averageRating?.toFixed(1) ?? "—"],
            [
              "Response",
              userProfile.avgResponseMinutes != null
                ? `${userProfile.avgResponseMinutes}m`
                : "—",
            ],
            [
              "Complete",
              userProfile.completionRate != null
                ? `${Math.round(userProfile.completionRate * 100)}%`
                : "—",
            ],
          ].map(([label, val]) => (
            <div
              key={String(label)}
              className={cn(
                "rounded-xl py-2",
                isLight ? "bg-black/[0.04]" : "bg-[#2c2c2e]"
              )}
            >
              <p className={cn("text-[14px] font-black tabular-nums", t.ink)}>
                {val}
              </p>
              <p className={cn("text-[10px]", t.muted)}>{label}</p>
            </div>
          ))}
        </div>
      </ProfileSection>

      <ProfileSection title="Verification" isLight={isLight}>
        <TierProgress profile={userProfile} isLight={isLight} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push("/verify")}
            className="text-[12px] font-bold text-brand"
          >
            NIN + BVN →
          </button>
          {!userProfile.faceLivenessVerified && (
            <button
              type="button"
              onClick={() => setShowLiveness(true)}
              className="text-[12px] font-bold text-brand"
            >
              Face liveness →
            </button>
          )}
        </div>
        {showLiveness && (
          <div className="mt-3">
            <FaceLiveness
              isLight={isLight}
              onCancel={() => setShowLiveness(false)}
              onPassed={() => {
                updateUserProfile({
                  faceLivenessVerified: true,
                  faceLivenessAt: new Date().toISOString(),
                });
                setShowLiveness(false);
                setMsg("Face liveness passed (Tier 2 progress).");
              }}
            />
          </div>
        )}
        {hasVerificationMark(userProfile) && (
          <p className={cn("mt-2 flex items-center gap-1 text-[12px] font-semibold", t.ink)}>
            <VerificationMark profile={userProfile} /> Verification Mark active
          </p>
        )}
      </ProfileSection>

      {hasVerificationMark(userProfile) && (
        <ProfileSection title="Payout & CAC (Tier 3)" isLight={isLight}>
          {editing ? (
            <div className="space-y-2">
              <input
                className={field}
                placeholder="Bank name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
              <input
                className={field}
                placeholder="Account name"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
              />
              <input
                className={field}
                placeholder="Account number"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
              <label className="block">
                <span className={cn("mb-1 block text-[11px] font-semibold", t.muted)}>
                  Business registration / CAC (optional)
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className={cn(
                    "w-full text-[12px]",
                    isLight ? "text-slate-700" : "text-white/80"
                  )}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setCacName(f.name);
                    try {
                      if (f.type.startsWith("image/")) {
                        setCacData(await compressImageFile(f, { maxEdge: 1200 }));
                      } else {
                        const reader = new FileReader();
                        reader.onload = () => setCacData(String(reader.result || ""));
                        reader.readAsDataURL(f);
                      }
                    } catch {
                      setErr("Could not upload CAC document.");
                    }
                  }}
                />
                {cacName && (
                  <p className={cn("mt-1 text-[11px]", t.muted)}>
                    Attached · {cacName}
                  </p>
                )}
              </label>
            </div>
          ) : (
            <div className={cn("space-y-1 text-[12px]", t.ink)}>
              <p>{userProfile.bankName || "Bank not set"}</p>
              <p className={t.muted}>
                {userProfile.bankAccountName || "—"} ·{" "}
                {userProfile.bankAccountNumber
                  ? `••••${userProfile.bankAccountNumber.slice(-4)}`
                  : "—"}
              </p>
              {userProfile.cacDocumentName && (
                <p className={t.muted}>CAC · {userProfile.cacDocumentName}</p>
              )}
            </div>
          )}
        </ProfileSection>
      )}

      <ProfileSection title="Public preview" isLight={isLight}>
        <button
          type="button"
          onClick={() => router.push("/technician/pro-self")}
          className="text-[12px] font-bold text-brand"
        >
          View as motorists see you →
        </button>
      </ProfileSection>
    </ProfileShell>
  );
}
