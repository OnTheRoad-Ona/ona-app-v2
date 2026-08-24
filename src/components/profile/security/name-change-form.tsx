"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { profileTheme } from "@/lib/profile-system";
import { FaceLiveness } from "@/components/profile/face-liveness";

interface NameChangeFormProps {
  isLight: boolean;
  currentName: string;
  accessToken: string;
  userId?: string;
}

export function NameChangeForm({
  isLight,
  currentName,
  accessToken,
  userId,
}: NameChangeFormProps) {
  const [requestedName, setRequestedName] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [showLiveness, setShowLiveness] = useState(false);
  const t = profileTheme(isLight);

  const submit = async () => {
    const name = requestedName.trim();
    if (name.length < 2) {
      setErr("Enter your requested name (at least 2 characters).");
      return;
    }
    if (!reason.trim()) {
      setErr("Explain why you need to change your name.");
      return;
    }
    if (!livenessPassed) {
      setErr("Complete the selfie verification first.");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const res = await (
        await import("@/lib/api-auth-headers")
      ).authFetch("/api/security/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_name_change",
          accessToken,
          newValue: name,
          reason: reason.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;
      if (!json?.ok) {
        setErr(json?.error?.message || "Could not submit request.");
        return;
      }
      setSubmitted(true);
      setMsg("Name change request submitted for review.");
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-2">
        <p className={cn("text-[12px] font-medium", t.soft)}>
          Your name change request has been submitted. Our team will review it
          and notify you.
        </p>
      </div>
    );
  }

  const field = isLight
    ? "h-10 w-full border-0 border-b border-black/15 bg-transparent px-0 text-[13px] font-medium text-slate-900 outline-none"
    : "h-10 w-full rounded-xl border-0 bg-[#2c2c2e] px-3 text-[13px] font-medium text-white outline-none";

  return (
    <div className="space-y-3">
      <p className={cn("text-[11px] font-semibold", t.muted)}>Current name</p>
      <p className={cn("text-[13px] font-semibold", t.ink)}>{currentName}</p>

      {(msg || err) && (
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-[12px] font-semibold",
            err
              ? "bg-red-500/15 text-red-400"
              : "bg-emerald-500/15 text-emerald-500",
          )}
        >
          {err || msg}
        </p>
      )}

      <input
        className={field}
        placeholder="Requested name"
        value={requestedName}
        onChange={(e) => setRequestedName(e.target.value)}
      />

      <textarea
        className={cn(field, "min-h-[60px] resize-none pt-2")}
        placeholder="Reason for name change"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <div>
        <p className={cn("mb-1 text-[11px] font-semibold", t.muted)}>
          Selfie verification
        </p>
        {livenessPassed ? (
          <p className={cn("text-[12px] font-medium text-emerald-500")}>
            Selfie verified
          </p>
        ) : showLiveness ? (
          <FaceLiveness
            isLight={isLight}
            userId={userId}
            onCancel={() => setShowLiveness(false)}
            onPassed={() => {
              setLivenessPassed(true);
              setShowLiveness(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowLiveness(true)}
            className={cn(
              "h-10 w-full rounded-xl border-0 text-[12px] font-bold",
              isLight
                ? "bg-black/10 text-slate-800"
                : "bg-[#2c2c2e] text-white",
            )}
          >
            Take selfie to verify identity
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit name change request"}
      </button>
    </div>
  );
}
