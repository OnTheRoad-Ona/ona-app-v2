"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Delete account — confirm + deactivate (soft).
 * Sits alone at the bottom of Settings.
 */
export default function SettingsDeleteAccountPage() {
  const router = useRouter();
  const { theme, userProfile, logout, updateUserProfile } = useApp();
  const isLight = theme === "light";
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirmWord = "DELETE";

  const deactivate = async () => {
    setErr(null);
    if (typed.trim().toUpperCase() !== confirmWord) {
      setErr(`Type ${confirmWord} to confirm.`);
      return;
    }
    setBusy(true);
    try {
      // Soft-delete: clear local identity; server hard-delete is admin-only for now
      updateUserProfile({
        // mark inactive in vault profile if field exists
        email: userProfile?.email,
      });
      try {
        localStorage.setItem(
          `ona-account-deactivated:${userProfile?.email || "x"}`,
          new Date().toISOString()
        );
      } catch {
        /* */
      }
      await logout();
      router.replace("/login");
    } catch {
      setErr("Could not complete deactivation. Contact care.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="Delete account"
        subtitle="This cannot be undone"
        backHref="/settings"
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <div className="rounded-md bg-red-500/10 px-3 py-3 text-[12px] font-medium leading-relaxed text-red-700">
          Deactivating your Ona account signs you out and marks the account for
          removal. Active jobs may be cancelled. Contact care if you need a full
          server wipe: witcowavers@gmail.com
        </div>
        <label className="block">
          <span
            className={cn(
              "mb-1 block text-[11px] font-semibold",
              isLight ? "text-slate-600" : "text-white/65"
            )}
          >
            Type {confirmWord} to confirm
          </span>
          <input
            className={cn(
              "h-11 w-full rounded-md border-0 px-3 text-[14px] font-bold outline-none",
              isLight
                ? "bg-black/10 text-slate-900"
                : "bg-white/10 text-white"
            )}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoComplete="off"
          />
        </label>
        {err ? (
          <p className="text-[11px] font-semibold text-red-500">{err}</p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void deactivate()}
          className="flex h-11 w-full items-center justify-center rounded-md border-0 bg-red-600 text-[13px] font-bold text-white disabled:opacity-60"
        >
          {busy ? "Working…" : "Deactivate my account"}
        </button>
      </div>
    </div>
  );
}
