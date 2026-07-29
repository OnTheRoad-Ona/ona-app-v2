"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ProfileSection,
  ProfileShell,
} from "@/components/profile/profile-shell";
import { MotoristVehicleWizard } from "@/components/profile/motorist-vehicle-wizard";
import { TierProgress } from "@/components/profile/verification-mark";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { compressImageFile } from "@/lib/image-compress";
import { memberSinceLabel, profileTheme } from "@/lib/profile-system";
import { DOCS_PENDING_MAX_RADIUS_KM } from "@/lib/skill-questions";
import { useApp } from "@/lib/store";
import type { MotoristVehicle, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

function vehiclesFromProfile(p: UserProfile): MotoristVehicle[] {
  if (Array.isArray(p.vehicles) && p.vehicles.length > 0) return p.vehicles;
  if (p.vehicleMake || p.vehicleModel) {
    return [
      {
        id: "legacy-primary",
        make: p.vehicleMake || "",
        model: p.vehicleModel || "",
        year: p.vehicleYear,
        plate: p.vehiclePlate,
        photo: p.vehiclePhoto,
        commonIssues: p.vehicleCommonIssues,
      },
    ];
  }
  return [];
}

function legacyFieldsFromVehicles(list: MotoristVehicle[]) {
  const first = list[0];
  if (!first) {
    return {
      vehicleMake: undefined as string | undefined,
      vehicleModel: undefined as string | undefined,
      vehicleYear: undefined as string | undefined,
      vehiclePlate: undefined as string | undefined,
      vehiclePhoto: undefined as string | undefined,
      vehicleCommonIssues: undefined as string[] | undefined,
    };
  }
  return {
    vehicleMake: first.make || undefined,
    vehicleModel: first.model || undefined,
    vehicleYear: first.year,
    vehiclePlate: first.plate,
    vehiclePhoto: first.photo,
    vehicleCommonIssues: first.commonIssues,
  };
}

/**
 * 2. Motorist own profile — editable only by the motorist.
 */
export function MotoristOwnProfile({ isLight }: { isLight: boolean }) {
  const router = useRouter();
  const {
    userProfile,
    updateUserProfile,
    location,
  } = useApp();
  const t = profileTheme(isLight);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [fullName, setFullName] = useState(userProfile?.fullName || "");
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatarUrl || "");
  const [vehicles, setVehicles] = useState<MotoristVehicle[]>(() =>
    userProfile ? vehiclesFromProfile(userProfile) : []
  );
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [emName, setEmName] = useState(
    userProfile?.emergencyContact?.name || ""
  );
  const [emPhone, setEmPhone] = useState(
    userProfile?.emergencyContact?.phone || ""
  );
  const [saved, setSaved] = useState(
    userProfile?.savedLocations || []
  );

  const jobsRequested = userProfile?.jobsRequested ?? userProfile?.serviceActionCount ?? 0;
  const jobsCompleted = userProfile?.jobsCompleted ?? 0;
  const ratingGiven = userProfile?.averageRatingGiven ?? 0;

  if (!userProfile || userProfile.accountType !== "motorist") {
    return (
      <ProfileShell isLight={isLight} title="My Profile" error="Sign in as a Customer to view this profile." />
    );
  }

  const field = isLight
    ? "h-10 w-full border-0 border-b border-black/15 bg-transparent px-0 text-[13px] font-medium text-slate-900 outline-none"
    : "h-10 w-full rounded-xl border-0 bg-[#2c2c2e] px-3 text-[13px] font-medium text-white outline-none";

  const syncFromProfile = (p: UserProfile) => {
    setFullName(p.fullName || "");
    setAvatarUrl(p.avatarUrl || "");
    setVehicles(vehiclesFromProfile(p));
    setAddingVehicle(false);
    setEmName(p.emergencyContact?.name || "");
    setEmPhone(p.emergencyContact?.phone || "");
    setSaved(p.savedLocations || []);
  };

  const persistVehicles = (list: MotoristVehicle[]) => {
    setVehicles(list);
    const legacy = legacyFieldsFromVehicles(list);
    const e = updateUserProfile({
      vehicles: list,
      ...legacy,
    });
    if (e) {
      setErr(e);
      return false;
    }
    setMsg(list.length ? "Vehicles updated." : "Vehicle removed.");
    return true;
  };

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    try {
      const url = await compressImageFile(file, { maxEdge: 512 });
      setAvatarUrl(url);
    } catch {
      setErr("Could not process image.");
    }
  };

  const save = () => {
    setErr(null);
    setMsg(null);
    const legacy = legacyFieldsFromVehicles(vehicles);
    const e = updateUserProfile({
      fullName: fullName.trim(),
      avatarUrl: avatarUrl || undefined,
      vehicles,
      ...legacy,
      emergencyContact:
        emName.trim() || emPhone.trim()
          ? { name: emName.trim(), phone: emPhone.trim() }
          : undefined,
      savedLocations: saved,
    });
    if (e) {
      setErr(e);
      return;
    }
    setMsg("Profile saved.");
    setEditing(false);
    setAddingVehicle(false);
  };

  const addLocation = () => {
    const id = `loc-${Date.now()}`;
    setSaved((prev) => [
      ...prev,
      {
        id,
        label: "Saved place",
        address: location.label || "Current pin",
        lat: location.coordinates.lat,
        lng: location.coordinates.lng,
      },
    ]);
  };

  return (
    <ProfileShell
      isLight={isLight}
      title="My Profile"
      showEdit={!editing}
      onEdit={() => {
        syncFromProfile(userProfile);
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
                syncFromProfile(userProfile);
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
            onClick={() => {
              syncFromProfile(userProfile);
              setEditing(true);
            }}
          >
            Edit Profile
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
                {avatarInitials(fullName)}
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
            onChange={(e) => void onPickAvatar(e.target.files?.[0] || null)}
          />
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                className={field}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
              />
            ) : (
              <p className={cn("truncate text-[17px] font-black", t.ink)}>
                {userProfile.fullName}
              </p>
            )}
            <p className={cn("mt-0.5 text-[12px] font-semibold", t.muted)}>
              Customer
            </p>
            <p className={cn("mt-1 text-[11px]", t.muted)}>
              Member since {memberSinceLabel(userProfile.registeredAt)}
            </p>
          </div>
        </div>
      </ProfileSection>

      <ProfileSection title="Contact" isLight={isLight}>
        <div className="space-y-1.5 text-[12px]">
          <div className="flex justify-between gap-2">
            <span className={t.muted}>Phone</span>
            <span className={cn("font-semibold", t.ink)}>
              {userProfile.phone}{" "}
              <span className="text-[10px] text-emerald-500">verified · locked</span>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className={t.muted}>Email</span>
            <span className={cn("max-w-[60%] truncate text-right font-semibold", t.ink)}>
              {userProfile.email}
            </span>
          </div>
        </div>
      </ProfileSection>



      <ProfileSection title="Verification" isLight={isLight}>
        <TierProgress profile={userProfile} isLight={isLight} />
        {(userProfile?.docsStatus === "under_review" ||
          userProfile?.docsStatus === "none" ||
          userProfile?.docsStatus === "rejected") && (
          <div
            className={cn(
              "mt-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold leading-snug",
              userProfile.docsStatus === "rejected"
                ? "bg-red-500/15 text-red-500"
                : isLight
                  ? "bg-[#FF6B35]/15 text-[#a14500]"
                  : "bg-[#FF6B35]/20 text-[#FF6B35]"
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
        <button
          type="button"
          onClick={() => router.push("/verify")}
          className="mt-2 text-[12px] font-bold text-brand"
        >
          Continue verification →
        </button>
      </ProfileSection>

      <ProfileSection
        title="Vehicles"
        isLight={isLight}
        action={
          !addingVehicle ? (
            <button
              type="button"
              onClick={() => {
                setAddingVehicle(true);
                setMsg(null);
                setErr(null);
              }}
              className="inline-flex items-center gap-1 border-0 bg-transparent text-[12px] font-bold text-brand"
            >
              <Plus className="h-3.5 w-3.5" />
              Add vehicle
            </button>
          ) : null
        }
      >
        <div className="space-y-3">
          {vehicles.length === 0 && !addingVehicle && (
            <p className={cn("text-[12px]", t.muted)}>
              Add at least one vehicle. You can add as many as you need — one
              step at a time.
            </p>
          )}

          {vehicles.map((v) => (
            <div
              key={v.id}
              className={cn(
                "flex gap-3 rounded-xl p-2",
                isLight ? "bg-black/[0.04]" : "bg-white/[0.06]"
              )}
            >
              {v.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.photo}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
                    isLight ? "bg-black/8" : "bg-[#2c2c2e]"
                  )}
                >
                  <Camera className="h-5 w-5 text-brand" />
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-0.5 text-[12px]">
                <p className={cn("font-semibold", t.ink)}>
                  {[v.make, v.model, v.year].filter(Boolean).join(" · ")}
                </p>
                {v.plate ? (
                  <p className={t.muted}>Plate · {v.plate}</p>
                ) : null}
                {(v.commonIssues?.length ?? 0) > 0 && (
                  <p className={t.muted}>
                    Issues · {v.commonIssues!.join(", ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Remove vehicle"
                onClick={() => {
                  if (vehicles.length <= 1) {
                    setErr("Keep at least one vehicle on your account.");
                    return;
                  }
                  const next = vehicles.filter((x) => x.id !== v.id);
                  persistVehicles(next);
                }}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-0",
                  isLight ? "bg-black/8 text-slate-700" : "bg-[#2c2c2e] text-white/80"
                )}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {addingVehicle && (
            <MotoristVehicleWizard
              isLight={isLight}
              onCancel={() => setAddingVehicle(false)}
              onSave={(v) => {
                const next = [...vehicles, v];
                if (persistVehicles(next)) setAddingVehicle(false);
              }}
            />
          )}
        </div>
      </ProfileSection>

      <ProfileSection
        title="Saved locations"
        isLight={isLight}
        action={
          editing ? (
            <button
              type="button"
              onClick={addLocation}
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-brand"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          ) : null
        }
      >
        {saved.length === 0 ? (
          <p className={cn("text-[12px]", t.muted)}>No saved places yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {saved.map((loc) => (
              <li
                key={loc.id}
                className={cn(
                  "flex items-start gap-2 rounded-xl px-2 py-2",
                  isLight ? "bg-black/[0.04]" : "bg-[#2c2c2e]"
                )}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <input
                      className={cn(field, "h-8")}
                      value={loc.label}
                      onChange={(e) =>
                        setSaved((prev) =>
                          prev.map((x) =>
                            x.id === loc.id
                              ? { ...x, label: e.target.value }
                              : x
                          )
                        )
                      }
                    />
                  ) : (
                    <p className={cn("text-[12px] font-bold", t.ink)}>{loc.label}</p>
                  )}
                  <p className={cn("truncate text-[11px]", t.muted)}>{loc.address}</p>
                </div>
                {editing && (
                  <button
                    type="button"
                    onClick={() =>
                      setSaved((prev) => prev.filter((x) => x.id !== loc.id))
                    }
                    className="border-0 bg-transparent p-1 text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </ProfileSection>

      <ProfileSection title="Emergency contact" isLight={isLight}>
        {editing ? (
          <div className="space-y-2">
            <input
              className={field}
              placeholder="Name"
              value={emName}
              onChange={(e) => setEmName(e.target.value)}
            />
            <input
              className={field}
              placeholder="Phone"
              value={emPhone}
              onChange={(e) => setEmPhone(e.target.value)}
            />
          </div>
        ) : (
          <p className={cn("text-[12px]", t.ink)}>
            {userProfile.emergencyContact?.name || "—"}
            {userProfile.emergencyContact?.phone
              ? ` · ${userProfile.emergencyContact.phone}`
              : ""}
          </p>
        )}
      </ProfileSection>

      <ProfileSection title="Your stats" isLight={isLight}>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            ["Requested", jobsRequested],
            ["Completed", jobsCompleted],
            ["Avg given", ratingGiven ? ratingGiven.toFixed(1) : "—"],
          ].map(([label, val]) => (
            <div
              key={String(label)}
              className={cn(
                "rounded-xl py-2",
                isLight ? "bg-black/[0.04]" : "bg-[#2c2c2e]"
              )}
            >
              <p className={cn("text-[15px] font-black tabular-nums", t.ink)}>
                {val}
              </p>
              <p className={cn("text-[10px]", t.muted)}>{label}</p>
            </div>
          ))}
        </div>
      </ProfileSection>
      {/* Recent jobs live on the Repair Pro dashboard only */}
    </ProfileShell>
  );
}
