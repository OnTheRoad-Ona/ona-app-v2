"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsField,
  SettingsSaveBar,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import { compressImageFile } from "@/lib/image-compress";
import { isValidEmail } from "@/lib/signup-validation";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Settings → Profile & Account (Customer) / Profile & Business (Pro)
 * Email/phone changes note verification; full OTP flow on /verify for phone.
 */
export default function SettingsProfilePage() {
  const { theme, userProfile, updateUserProfile, accountType } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const fileRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userProfile) return;
    const parts = (userProfile.fullName || "").trim().split(/\s+/);
    setFirstName(parts[0] || "");
    setLastName(parts.slice(1).join(" ") || "");
    setEmail(userProfile.email || "");
    setPhone(userProfile.phone || "");
    setAvatar(userProfile.avatarUrl || "");
    setBusinessName(userProfile.businessName || "");
    setBio(userProfile.bio || "");
  }, [userProfile]);

  const save = () => {
    setErr(null);
    setMsg(null);
    if (!firstName.trim() || firstName.trim().length < 1) {
      setErr("First name is required.");
      return;
    }
    if (!lastName.trim()) {
      setErr("Last name is required.");
      return;
    }
    if (!isValidEmail(email)) {
      setErr("Enter a valid email address.");
      return;
    }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 7) {
      setErr("Phone number with country code is required.");
      return;
    }
    const emailChanged =
      email.trim().toLowerCase() !== (userProfile?.email || "").toLowerCase();
    const phoneChanged =
      phone.trim() !== (userProfile?.phone || "").trim();

    setBusy(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const e = updateUserProfile({
      fullName,
      email: email.trim(),
      phone: phone.trim(),
      avatarUrl: avatar || undefined,
      ...(isPro
        ? {
            businessName: businessName.trim() || undefined,
            bio: bio.trim().slice(0, 280) || undefined,
          }
        : {}),
      // Changing phone resets phoneVerified until re-OTP
      ...(phoneChanged ? { phoneVerified: false } : {}),
    });
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
    let note = "Profile saved.";
    if (emailChanged) {
      note +=
        " Email change needs re-validation — confirm via your inbox when enabled.";
    }
    if (phoneChanged) {
      note += " Verify your new phone under Verify (Tier 1 OTP).";
    }
    setMsg(note);
  };

  if (!userProfile) {
    return (
      <div className={cn("flex h-full flex-col", isLight ? "bg-[#c8c9cd]" : "bg-black")}>
        <PageHeader title="Profile" backHref="/settings" />
        <p className="px-4 text-[13px] text-muted">Sign in to edit your profile.</p>
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
        title={isPro ? "Profile & business" : "Profile & account"}
        subtitle="Required fields · verify email/phone when changed"
        backHref="/settings"
      />
      <div className="flex-1 overflow-y-auto pb-6 scrollbar-hide">
        <div className="flex flex-col items-center gap-2 px-3 py-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative h-20 w-20 overflow-hidden rounded-md border-0 bg-black/10"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="mx-auto h-6 w-6 text-brand" />
            )}
          </button>
          <p className={cn("text-[11px] font-medium", isLight ? "text-slate-600" : "text-white/60")}>
            Profile photo (optional)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setAvatar(await compressImageFile(f, { maxEdge: 512 }));
              } catch {
                setErr("Could not process photo.");
              }
            }}
          />
        </div>

        <div
          className={cn(
            "mx-3 overflow-hidden rounded-md",
            isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
          )}
        >
          <SettingsField label="First name *" isLight={isLight}>
            <input
              className={settingsInputClass(isLight)}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </SettingsField>
          <SettingsField label="Last name *" isLight={isLight}>
            <input
              className={settingsInputClass(isLight)}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </SettingsField>
          <SettingsField
            label="Email *"
            isLight={isLight}
            hint="Change requires verification when email confirm is enabled."
          >
            <input
              className={settingsInputClass(isLight)}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </SettingsField>
          <SettingsField
            label="Phone (with country code) *"
            isLight={isLight}
            hint="Change requires OTP — use Verify after saving."
          >
            <input
              className={settingsInputClass(isLight)}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="+234…"
            />
          </SettingsField>
          {isPro ? (
            <>
              <SettingsField label="Business / display name" isLight={isLight}>
                <input
                  className={settingsInputClass(isLight)}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Workshop or brand name"
                />
              </SettingsField>
              <SettingsField
                label="Bio"
                isLight={isLight}
                hint="Short & professional (max 280)."
              >
                <textarea
                  className={cn(settingsInputClass(isLight), "h-24 resize-none py-2")}
                  value={bio}
                  maxLength={280}
                  onChange={(e) => setBio(e.target.value.slice(0, 280))}
                  placeholder="What customers should know about your work"
                />
              </SettingsField>
            </>
          ) : null}
          <SettingsSaveBar
            isLight={isLight}
            busy={busy}
            msg={msg}
            err={err}
            onSave={save}
          />
        </div>

        {isPro ? (
          <p
            className={cn(
              "mx-3 mt-3 text-[11px] font-medium leading-snug",
              isLight ? "text-slate-600" : "text-white/55"
            )}
          >
            Skills & specialties: edit on public profile / verification. Labour
            prices: Settings → Pricing & services.
          </p>
        ) : (
          <p
            className={cn(
              "mx-3 mt-3 text-[11px] font-medium leading-snug",
              isLight ? "text-slate-600" : "text-white/55"
            )}
          >
            Saved addresses: Settings → Addresses & location. Vehicles: My
            profile.
          </p>
        )}

        <div
          className={cn(
            "mx-3 mt-3 overflow-hidden rounded-md",
            isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
          )}
        >
          <p
            className={cn(
              "px-3 pt-3 text-[12px] font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Linked accounts
          </p>
          <p
            className={cn(
              "px-3 pb-3 pt-1 text-[11px] font-medium leading-snug",
              isLight ? "text-slate-600" : "text-white/55"
            )}
          >
            Connect or unlink Google and Facebook — coming soon. Password login
            remains available.
          </p>
        </div>

        {!isPro ? (
          <div
            className={cn(
              "mx-3 mt-3 overflow-hidden rounded-md",
              isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
            )}
          >
            <p
              className={cn(
                "px-3 pt-3 text-[12px] font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Promotions & credits
            </p>
            <p
              className={cn(
                "px-3 pb-3 pt-1 text-[11px] font-medium leading-snug",
                isLight ? "text-slate-600" : "text-white/55"
              )}
            >
              Promo codes, referral rewards, and credits — coming soon. Refunds
              use your Nigeria bank under Payments.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
