"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Radio } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AchievementBadgesRow } from "@/components/profile/achievement-badges";
import { BioField } from "@/components/profile/bio-field";
import { FaceLiveness } from "@/components/profile/face-liveness";
import { NewAccountBadge } from "@/components/profile/new-account-badge";
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
import { getArtisanProfile } from "@/lib/artisan/local-store";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { compressImageFile } from "@/lib/image-compress";
import {
  clampProServiceRadiusKm,
  EXP_YEARS,
  formatExperience,
  hasVerificationMark,
  isExperienceUnset,
  memberSinceLabel,
  profileTheme,
  SERVICE_RADIUS_OPTIONS_KM,
} from "@/lib/profile-system";
import { useApp } from "@/lib/store";
import { isProService } from "@/lib/services";
import { DOCS_PENDING_MAX_RADIUS_KM } from "@/lib/skill-questions";
import { PhoneChangeFlow } from "@/components/profile/security/phone-change-flow";
import { EmailChangeFlow } from "@/components/profile/security/email-change-flow";
import { PasswordChangeFlow } from "@/components/profile/security/password-change-flow";
import { BankChangeFlow } from "@/components/profile/security/bank-change-flow";
import { NameChangeForm } from "@/components/profile/security/name-change-form";
import type { ProService, UserProfile } from "@/lib/types";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { cn } from "@/lib/utils";

/** First / primary signup skill only — never multi-trade on My Profile */
function primarySkill(
  profile: UserProfile | null | undefined,
  proServices: ProService[]
): ProService[] {
  const fromProfile = (profile?.services || []).filter(isProService);
  if (fromProfile[0]) return [fromProfile[0]];
  const fromState = (proServices || []).filter(isProService);
  if (fromState[0]) return [fromState[0]];
  return [];
}

/**
 * Repair Pro own profile.
 * Locked after signup: full name, single skill; years only if already set.
 * Edit via header pencil. Labour prices not on My Profile.
 */
export function ProOwnProfile({ isLight }: { isLight: boolean }) {
  const router = useRouter();
  const {
    userProfile,
    updateUserProfile,
    proLive,
    setProLive,
    proServices,
    backendUserId,
  } = useApp();
  const t = profileTheme(isLight);
  const fileRef = useRef<HTMLInputElement>(null);

  const lockedSkills = useMemo(
    () => primarySkill(userProfile, proServices),
    [userProfile, proServices]
  );
  const artisan = useMemo(
    () =>
      userProfile?.identityId
        ? getArtisanProfile(userProfile.identityId)
        : null,
    [userProfile?.identityId]
  );
  const canSetExperience = isExperienceUnset(userProfile?.yearsExperience);

  const [accessToken, setAccessToken] = useState("");
  const [nameChangeOpen, setNameChangeOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { getAppSupabase } = await import("@/lib/supabase/app-client");
        const sb = getAppSupabase();
        const s = sb ? (await sb.auth.getSession()).data.session : null;
        if (s?.access_token) setAccessToken(s.access_token);
      } catch { /* */ }
    })();
  }, []);

  const [editing, setEditing] = useState(false);
  const [showLiveness, setShowLiveness] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);

  const [businessName, setBusinessName] = useState(
    userProfile?.businessName || ""
  );
  const [bio, setBio] = useState(userProfile?.bio || "");
  const [years, setYears] = useState(userProfile?.yearsExperience || "");
  const [radiusKm, setRadiusKm] = useState(
    clampProServiceRadiusKm(userProfile?.serviceRadiusKm)
  );
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatarUrl || "");
  const [gName, setGName] = useState(userProfile?.guarantor?.fullName || "");
  const [gPhone, setGPhone] = useState(userProfile?.guarantor?.phone || "");
  const [gOccupation, setGOccupation] = useState(userProfile?.guarantor?.occupation || "");
  const [gAddress, setGAddress] = useState(userProfile?.guarantor?.address || "");
  const [gRelationship, setGRelationship] = useState(userProfile?.guarantor?.relationship || "");

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
  const lockedField = isLight
    ? "text-[13px] font-semibold text-slate-900"
    : "text-[13px] font-semibold text-white";
  const lockedHint = isLight
    ? "text-[10px] font-medium text-slate-500"
    : "text-[10px] font-medium text-white/45";

  const sync = (p: UserProfile | null | undefined) => {
    setBusinessName(p?.businessName || "");
    setBio(p?.bio || "");
    setYears(p?.yearsExperience || "");
    setRadiusKm(clampProServiceRadiusKm(p?.serviceRadiusKm));
    setAvatarUrl(p?.avatarUrl || "");
    setGName(p?.guarantor?.fullName || "");
    setGPhone(p?.guarantor?.phone || "");
    setGOccupation(p?.guarantor?.occupation || "");
    setGAddress(p?.guarantor?.address || "");
    setGRelationship(p?.guarantor?.relationship || "");
  };

  const save = () => {
    setErr(null);
    setMsg(null);
    const skill = lockedSkills[0];
    const expUnset = isExperienceUnset(userProfile.yearsExperience);
    const e = updateUserProfile({
      businessName: businessName.trim() || undefined,
      bio: bio.slice(0, 144) || undefined,
      // One-time: only if still unset and user picked a value
      ...(expUnset && !isExperienceUnset(years)
        ? { yearsExperience: years.trim() }
        : {}),
      services: skill ? [skill] : userProfile.services,
      serviceRadiusKm: clampProServiceRadiusKm(radiusKm),
      avatarUrl: avatarUrl || undefined,
      guarantor: {
        fullName: gName.trim(),
        phone: gPhone.trim(),
        address: gAddress.trim() || undefined,
        occupation: gOccupation.trim() || undefined,
        relationship: gRelationship.trim(),
      },
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

  const displayRadius = clampProServiceRadiusKm(
    editing ? radiusKm : userProfile.serviceRadiusKm
  );

  return (
    <ProfileShell
      isLight={isLight}
      title="My Profile"
      showEdit={!editing}
      onEdit={() => {
        if (!userProfile) return;
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
          <Button
            size="lg"
            className="h-11 w-full"
            disabled={liveBusy}
            onClick={() => void toggleLive()}
          >
            <Radio className="h-4 w-4" />
            {proLive ? "Go Offline" : "Go Online"}
          </Button>
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

      {(userProfile.docsStatus === "under_review" ||
        userProfile.docsStatus === "none" ||
        userProfile.docsStatus === "rejected") && (
        <div
          className={cn(
            "mb-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold leading-snug",
            userProfile.docsStatus === "rejected"
              ? "bg-red-500/15 text-red-500"
              : isLight
                ? "bg-[#FF6B35]/150/15 text-[#FF6B35]"
                : "bg-[#FF6B35]/150/20 text-[#FF6B35]"
          )}
        >
          <p className="font-black uppercase tracking-wide">
            {userProfile.docsStatus === "rejected"
              ? "Documents rejected"
              : "Under review"}
          </p>
          <p className="mt-0.5 font-medium opacity-90">
            {userProfile.docsStatus === "rejected"
              ? "Your certification was not approved. Re-upload or contact support."
              : `Your documents are being checked. You stay visible only within ${DOCS_PENDING_MAX_RADIUS_KM} km until approved. After Tier 4 verification and approval you get +1 star instantly.`}
          </p>
          {userProfile.certificationFileName ? (
            <p className="mt-1 text-[11px] opacity-80">
              File: {userProfile.certificationFileName}
            </p>
          ) : null}
        </div>
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
                alt={userProfile.fullName}
                className="object-cover"
              />
              <AvatarFallback className="bg-brand font-bold text-white">
                {avatarInitials(userProfile.fullName)}
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
                const dataUrl = await compressImageFile(f, { maxEdge: 512 });
                const res = await fetch("/api/profile/upload-avatar", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ accessToken, imageDataUrl: dataUrl }),
                });
                const json = await res.json() as { ok?: boolean; data?: { url?: string }; error?: { message?: string } };
                if (json?.ok && json.data?.url) {
                  setAvatarUrl(json.data.url);
                } else {
                  setErr(json?.error?.message || "Could not upload image.");
                }
              } catch {
                setErr("Could not process image.");
              }
            }}
          />
          <div className="min-w-0 flex-1">
            {/* Full name — always locked */}
            <p
              className={cn(
                "flex flex-wrap items-center gap-1.5 text-[17px] font-black",
                t.ink
              )}
            >
              <span className="truncate">{userProfile.fullName}</span>
              <VerificationMark profile={userProfile} />
              <NewAccountBadge
                visibilityTier={artisan?.visibilityTier ?? 1}
                status={artisan?.status}
                size="md"
              />
            </p>
            {editing ? (
              <input
                className={cn(field, "mt-1.5")}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Business / workshop name"
              />
            ) : (
              userProfile.businessName && (
                <p className={cn("text-[12px] font-semibold", t.soft)}>
                  {userProfile.businessName}
                </p>
              )
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

      <ProfileSection title="Contact & Security" isLight={isLight}>
        <div className="space-y-3">
          <PhoneChangeFlow
            isLight={isLight}
            currentPhone={userProfile.phone}
            currentEmail={userProfile.email}
            isPhoneVerified={!!userProfile.phoneVerified}
            guarantorName={userProfile.guarantor?.fullName}
            accessToken={accessToken}
            onPhoneChanged={(p) => updateUserProfile({ phone: p })}
          />
          <hr className={cn("border-0", isLight ? "border-black/8" : "border-white/8")} />
          <EmailChangeFlow
            isLight={isLight}
            currentEmail={userProfile.email}
            isEmailVerified={!!userProfile.emailVerified}
            guarantorName={userProfile.guarantor?.fullName}
            accessToken={accessToken}
            onEmailChanged={(e) => updateUserProfile({ email: e })}
          />
          <hr className={cn("border-0", isLight ? "border-black/8" : "border-white/8")} />
          <PasswordChangeFlow
            isLight={isLight}
            accessToken={accessToken}
          />
        </div>
      </ProfileSection>

      <ProfileSection title="Name" isLight={isLight}>
        <div className="space-y-1">
          <p className={cn("text-[13px] font-semibold", t.ink)}>
            {userProfile.fullName}

          </p>
          <p className={cn("text-[11px]", isLight ? "text-slate-900" : "text-white")}>
            Name cannot be changed here.
            <button
              type="button"
              onClick={() => setNameChangeOpen(!nameChangeOpen)}
              className={cn("ml-1 font-bold", isLight ? "text-slate-900" : "text-white", nameChangeOpen ? "text-red-400" : "")}
            >
              {nameChangeOpen ? "Cancel" : "Request name change"}
            </button>
          </p>
          {nameChangeOpen && (
            <div className="mt-2">
              <NameChangeForm
                isLight={isLight}
                currentName={userProfile.fullName}
                accessToken={accessToken}
                userId={userProfile.identityId}
              />
            </div>
          )}
        </div>
      </ProfileSection>

      <ProfileSection title="Experience" isLight={isLight}>
        {editing && canSetExperience ? (
          <select
            className={field}
            value={years}
            onChange={(e) => setYears(e.target.value)}
          >
            <option value="">Select years…</option>
            {EXP_YEARS.map((y) => (
              <option key={y} value={y}>
                {formatExperience(y)}
              </option>
            ))}
          </select>
        ) : (
          <p className={lockedField}>
            {formatExperience(userProfile.yearsExperience)}
          </p>
        )}
      </ProfileSection>

      <ProfileSection title="Skill" isLight={isLight}>
        <SkillsChips
          selected={lockedSkills}
          isLight={isLight}
          editable={false}
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
        <p className={cn("mb-2 text-[12px] font-semibold", t.ink)}>
          {displayRadius} km coverage
        </p>
        {editing ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
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
        ) : null}
        {/* Always show radius map (view + edit) */}
        <RadiusMapPreview
          radiusKm={displayRadius}
          isLight={isLight}
          className="mt-1"
        />
      </ProfileSection>

      <ProfileSection title="Stats" isLight={isLight}>
        {userProfile.averageRating != null && (
          <div className="mb-2">
            <StarRatingDisplay
              rating={userProfile.averageRating}
              size="md"
              className={t.ink}
            />
          </div>
        )}
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
          <p
            className={cn(
              "mt-2 flex items-center gap-1 text-[12px] font-semibold",
              t.ink
            )}
          >
            <VerificationMark profile={userProfile} /> Verification Mark active
          </p>
        )}
      </ProfileSection>

      {hasVerificationMark(userProfile) && (
        <>
          <ProfileSection title="Payout (Tier 3)" isLight={isLight}>
            <BankChangeFlow
              isLight={isLight}
              currentBank={{
                bankName: userProfile.bankName,
                bankAccountName: userProfile.bankAccountName,
                bankAccountNumber: userProfile.bankAccountNumber,
                bankCode: userProfile.bankCode,
              }}
              userPhone={userProfile.phone}
              accessToken={accessToken}
              onBankChanged={(b) => {
                updateUserProfile({
                  bankName: b.bankName,
                  bankAccountName: b.bankAccountName,
                  bankAccountNumber: b.bankAccountNumber,
                  bankCode: b.bankCode,
                });
              }}
            />
          </ProfileSection>

          <ProfileSection title="Business registration / CAC" isLight={isLight}>
            {userProfile.cacDocumentName ? (
              <p className={cn("text-[12px]", t.ink)}>
                Attached · {userProfile.cacDocumentName}
              </p>
            ) : (
              <p className={cn("text-[12px]", t.muted)}>No document uploaded.</p>
            )}
            <label className="mt-2 block">
              <input
                type="file"
                accept="image/*,.pdf"
                className={cn("w-full text-[12px]", isLight ? "text-slate-700" : "text-white/80")}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const data = f.type.startsWith("image/")
                      ? await compressImageFile(f, { maxEdge: 1200 })
                      : await new Promise<string>((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(String(reader.result || ""));
                          reader.readAsDataURL(f);
                        });
                    updateUserProfile({ cacDocumentName: f.name, cacDocumentDataUrl: data });
                    setMsg("CAC document uploaded.");
                  } catch {
                    setErr("Could not upload document.");
                  }
                }}
              />
            </label>
          </ProfileSection>
        </>
      )}

      <ProfileSection title="Guarantor" isLight={isLight}>
        {editing ? (
          <div className="space-y-2">
            <input className={field} placeholder="Full name" value={gName}
              onChange={(e) => setGName(e.target.value)} />
            <input className={field} placeholder="Phone" value={gPhone}
              onChange={(e) => setGPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} />
            <input className={field} placeholder="Occupation" value={gOccupation}
              onChange={(e) => setGOccupation(e.target.value)} />
            <input className={field} placeholder="Residential address" value={gAddress}
              onChange={(e) => setGAddress(e.target.value)} />
            <input className={field} placeholder="Relationship to you" value={gRelationship}
              onChange={(e) => setGRelationship(e.target.value)} />
          </div>
        ) : (
          <div className={cn("space-y-1 text-[12px]", t.ink)}>
            <p>{userProfile.guarantor?.fullName || "Not set"}</p>
            <p className={t.muted}>{userProfile.guarantor?.phone || "—"}</p>
            {userProfile.guarantor?.occupation && (
              <p className={t.muted}>{userProfile.guarantor.occupation}</p>
            )}
            {userProfile.guarantor?.relationship && (
              <p className={t.muted}>{userProfile.guarantor.relationship}</p>
            )}
          </div>
        )}
      </ProfileSection>

      <ProfileSection title="Public preview" isLight={isLight}>
        <button
          type="button"
          onClick={() => router.push(`/technician/${backendUserId}`)}
          className="text-[12px] font-bold text-brand"
        >
          View as motorists see you →
        </button>
      </ProfileSection>
    </ProfileShell>
  );
}
