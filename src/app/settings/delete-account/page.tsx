"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { getAppSupabase } from "@/lib/supabase/app-client";

export default function SettingsDeleteAccountPage() {
  const router = useRouter();
  const { theme, logout, hasMotoristAccount, hasProAccount } = useApp();
  const isLight = theme === "light";
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasBoth = hasMotoristAccount && hasProAccount;
  const [deleteTarget, setDeleteTarget] = useState<
    "motorist" | "professional" | "both"
  >(hasBoth ? "both" : hasProAccount ? "professional" : "motorist");

  const confirmWord = "DELETE";

  const deactivate = async () => {
    setErr(null);
    if (typed.trim().toUpperCase() !== confirmWord) {
      setErr(`Type ${confirmWord} to confirm.`);
      return;
    }
    setBusy(true);
    try {
      const sb = getAppSupabase();
      const { data: sessionData } = await sb!.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, targetRole: deleteTarget }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.error?.message || "Deletion failed");
        setBusy(false);
        return;
      }

      if (deleteTarget === "both") {
        await logout();
        router.replace("/login");
      } else {
        // Switched or removed one role
        router.replace("/");
      }
    } catch {
      setErr("Could not complete deactivation. Contact care.");
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader
        title="Delete account"
        subtitle="Manage account or role deletion"
        backHref="/settings"
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <div className="rounded-md bg-red-500/10 px-3 py-3 text-[12px] font-medium leading-relaxed text-red-700">
          Your account or selected role will be scheduled for deletion. You have
          30 days to reactivate by contacting support or logging back in.
        </div>

        {hasBoth && (
          <div className="space-y-2">
            <span
              className={cn(
                "block text-[11px] font-semibold uppercase tracking-wide",
                isLight ? "text-slate-600" : "text-white/65",
              )}
            >
              Select what to delete
            </span>
            <div className="space-y-1.5">
              <label
                className={cn(
                  "flex items-center gap-2 rounded-lg p-3 text-[13px] font-semibold cursor-pointer",
                  isLight ? "bg-black/5" : "bg-white/5",
                  deleteTarget === "motorist" && "ring-2 ring-red-500",
                )}
              >
                <input
                  type="radio"
                  name="deleteTarget"
                  checked={deleteTarget === "motorist"}
                  onChange={() => setDeleteTarget("motorist")}
                  className="accent-red-600"
                />
                <span>Delete Customer Account Only</span>
              </label>
              <label
                className={cn(
                  "flex items-center gap-2 rounded-lg p-3 text-[13px] font-semibold cursor-pointer",
                  isLight ? "bg-black/5" : "bg-white/5",
                  deleteTarget === "professional" && "ring-2 ring-red-500",
                )}
              >
                <input
                  type="radio"
                  name="deleteTarget"
                  checked={deleteTarget === "professional"}
                  onChange={() => setDeleteTarget("professional")}
                  className="accent-red-600"
                />
                <span>Delete Repair Pro Account Only</span>
              </label>
              <label
                className={cn(
                  "flex items-center gap-2 rounded-lg p-3 text-[13px] font-semibold cursor-pointer",
                  isLight ? "bg-black/5" : "bg-white/5",
                  deleteTarget === "both" && "ring-2 ring-red-500",
                )}
              >
                <input
                  type="radio"
                  name="deleteTarget"
                  checked={deleteTarget === "both"}
                  onChange={() => setDeleteTarget("both")}
                  className="accent-red-600"
                />
                <span>Delete Both Accounts (Complete Deletion)</span>
              </label>
            </div>
          </div>
        )}

        <label className="block">
          <span
            className={cn(
              "mb-1 block text-[11px] font-semibold",
              isLight ? "text-slate-600" : "text-white/65",
            )}
          >
            Type {confirmWord} to confirm
          </span>
          <input
            className={cn(
              "h-11 w-full rounded-md border-0 px-3 text-[14px] font-bold outline-none",
              isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white",
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
          {busy ? "Working…" : "Schedule deletion"}
        </button>
      </div>
    </div>
  );
}
