"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { BrandHeroMotion } from "@/components/auth/brand-hero-motion";
import { useApp } from "@/lib/store";

/**
 * Logout confirmation with the same brand hero + Apple dynamic motion.
 */
export function LogoutScreen() {
  const router = useRouter();
  const { displayName, accountType, logout, isAuthenticated, authReady } =
    useApp();
  const [busy, setBusy] = useState(false);

  const roleLabel =
    accountType === "professional" ? "Repair Professional" : "Motorist";

  useEffect(() => {
    if (!authReady || busy) return;
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [authReady, busy, isAuthenticated, router]);

  const confirmLogout = () => {
    if (busy) return;
    setBusy(true);
    logout();
    router.replace("/login");
  };

  const stay = () => {
    router.back();
  };

  if (!authReady || (!isAuthenticated && !busy)) {
    return <div className="h-full w-full bg-black" aria-hidden />;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <BrandHeroMotion size="full" bottomFade={false} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-end px-5 pb-8 pt-10">
        <div className="om-apple-motion-delay mb-auto mt-8 text-center">
          <p className="text-[11px] font-bold tracking-[0.28em] text-white/80">
            OGA MECHO
          </p>
          <h1 className="mt-2 text-[24px] font-black text-white drop-shadow-md">
            Sign out?
          </h1>
          <p className="mt-2 text-[13px] text-white/75">
            {displayName}
            <span className="mx-1.5 opacity-40">·</span>
            {roleLabel}
          </p>
        </div>

        <div className="om-apple-motion-panel w-full space-y-2.5 rounded-2xl bg-black/55 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <p className="text-center text-[12px] text-white/70">
            You can sign back in anytime as a Motorist or Repair Professional.
          </p>

          <button
            type="button"
            onClick={confirmLogout}
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-0 bg-white text-[14px] font-bold text-slate-900 disabled:opacity-70"
          >
            <LogOut className="h-4 w-4" />
            {busy ? "Signing out…" : "Log out"}
          </button>

          <button
            type="button"
            onClick={stay}
            className="h-11 w-full rounded-xl border-0 bg-white/10 text-[14px] font-semibold text-white hover:bg-white/15"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
