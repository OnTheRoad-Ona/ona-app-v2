"use client";

/**
 * App permissions — Location, Camera, Microphone.
 * Shared by customer (map / ID / support) and repair pro (live GPS / ID / voice).
 */

import { useCallback, useEffect, useState } from "react";
import { Camera, MapPin, Mic } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type PermState = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

type Row = {
  id: "geolocation" | "camera" | "microphone";
  label: string;
  detail: string;
  icon: typeof MapPin;
  state: PermState;
};

function labelState(s: PermState): string {
  switch (s) {
    case "granted":
      return "Allowed";
    case "denied":
      return "Blocked";
    case "prompt":
      return "Not decided";
    case "unsupported":
      return "Not available";
    default:
      return "Unknown";
  }
}

function stateTone(s: PermState, isLight: boolean): string {
  if (s === "granted") return "text-emerald-600";
  if (s === "denied") return "text-red-500";
  return isLight ? "text-slate-600" : "text-white/60";
}

async function queryPerm(
  name: PermissionName | "camera" | "microphone" | "geolocation"
): Promise<PermState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    // Camera/mic use newer PermissionName in some browsers
    const result = await navigator.permissions.query({
      name: name as PermissionName,
    });
    const st = result.state;
    if (st === "granted" || st === "denied" || st === "prompt") return st;
    return "unknown";
  } catch {
    return "unsupported";
  }
}

export default function SettingsPermissionsPage() {
  const { theme, accountType } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";

  const [geo, setGeo] = useState<PermState>("unknown");
  const [cam, setCam] = useState<PermState>("unknown");
  const [mic, setMic] = useState<PermState>("unknown");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [g, c, m] = await Promise.all([
      queryPerm("geolocation"),
      queryPerm("camera"),
      queryPerm("microphone"),
    ]);
    setGeo(g === "unsupported" ? "unknown" : g);
    setCam(c === "unsupported" ? "unknown" : c);
    setMic(m === "unsupported" ? "unknown" : m);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function requestLocation() {
    setBusy("geolocation");
    setNote(null);
    try {
      await new Promise<void>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation not supported"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (e) => reject(e),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
      setNote("Location allowed for this browser.");
    } catch {
      setNote(
        "Location blocked or unavailable. Allow it in the browser address bar / system Settings, then refresh."
      );
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function requestCamera() {
    setBusy("camera");
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      setNote("Camera allowed for this browser.");
    } catch {
      setNote(
        "Camera blocked or unavailable. Allow camera in browser / system Settings, then try again."
      );
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function requestMic() {
    setBusy("microphone");
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      setNote("Microphone allowed for this browser.");
    } catch {
      setNote(
        "Microphone blocked or unavailable. Allow mic in browser / system Settings, then try again."
      );
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const rows: Row[] = [
    {
      id: "geolocation",
      label: "Location",
      detail: isPro
        ? "Live map position, job routing, and service area"
        : "Find nearby pros and share job pin with your pro",
      icon: MapPin,
      state: geo,
    },
    {
      id: "camera",
      label: "Camera",
      detail: isPro
        ? "ID verification photos and job evidence"
        : "ID upload and vehicle / problem photos",
      icon: Camera,
      state: cam,
    },
    {
      id: "microphone",
      label: "Microphone",
      detail: isPro
        ? "In-app voice calls with customers"
        : "In-app voice calls with your pro",
      icon: Mic,
      state: mic,
    },
  ];

  const onRequest = (id: Row["id"]) => {
    if (id === "geolocation") void requestLocation();
    else if (id === "camera") void requestCamera();
    else void requestMic();
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="App permissions"
        subtitle="Location, camera & microphone"
        backHref="/settings/sections/privacy"
      />
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <p className={cn("px-1 text-[12px] font-medium leading-snug", muted)}>
          Ona only uses these when you use maps, verification, photos, or calls.
          You can change access anytime in browser or phone settings.
        </p>
        {note ? (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-[12px] font-semibold",
              isLight ? "bg-black/5 text-slate-800" : "bg-white/10 text-white"
            )}
          >
            {note}
          </p>
        ) : null}

        <ul className="space-y-0.5">
          {rows.map((r, i) => {
            const Icon = r.icon;
            return (
              <li
                key={r.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-3",
                  i > 0 &&
                    (isLight
                      ? "border-t border-black/5"
                      : "border-t border-white/10")
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                  <Icon className="h-4 w-4 text-brand" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[13px] font-bold", ink)}>{r.label}</p>
                  <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                    {r.detail}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[11px] font-bold",
                      stateTone(r.state, isLight)
                    )}
                  >
                    {labelState(r.state)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === r.id || r.state === "granted"}
                  onClick={() => onRequest(r.id)}
                  className={cn(
                    "shrink-0 rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
                    r.state === "granted"
                      ? isLight
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-emerald-500/20 text-emerald-400"
                      : "bg-[#FF6B35] text-white disabled:opacity-50"
                  )}
                >
                  {busy === r.id
                    ? "…"
                    : r.state === "granted"
                      ? "On"
                      : "Allow"}
                </button>
              </li>
            );
          })}
        </ul>

        <p className={cn("px-1 pt-2 text-[11px] font-medium leading-snug", muted)}>
          If a permission stays blocked, open your browser site settings (or iOS
          / Android app settings) and enable access for this site, then return
          here and tap Allow again.
        </p>
      </div>
    </div>
  );
}
