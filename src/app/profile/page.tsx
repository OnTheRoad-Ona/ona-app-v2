"use client";

import { Suspense } from "react";
import { MotoristOwnProfile } from "@/components/profile/motorist-own-profile";
import { ProOwnProfile } from "@/components/profile/pro-own-profile";
import { useApp } from "@/lib/store";

/**
 * Own profile router:
 * - Motorist → editable motorist profile
 * - Repair Pro → editable pro profile
 * Repair Pros never see motorist profile data of others (no public motorist route).
 */
function ProfileInner() {
  const { theme, accountType, authReady, isAuthenticated } = useApp();
  const isLight = theme === "light";

  if (!authReady) {
    return (
      <div
        className={
          isLight
            ? "flex h-full items-center justify-center bg-[#c8c9cd] text-sm font-semibold text-slate-800"
            : "flex h-full items-center justify-center bg-black text-sm font-semibold text-white"
        }
      >
        Loading profile…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className={
          isLight
            ? "flex h-full flex-col items-center justify-center gap-3 bg-[#c8c9cd] px-4"
            : "flex h-full flex-col items-center justify-center gap-3 bg-black px-4"
        }
      >
        <p
          className={
            isLight
              ? "text-sm font-semibold text-slate-900"
              : "text-sm font-semibold text-white"
          }
        >
          Sign in to view your profile
        </p>
        <a
          href="/login/signin"
          className="rounded-xl bg-[#323231] px-4 py-2.5 text-[12px] font-bold text-white"
        >
          Sign in
        </a>
      </div>
    );
  }

  if (accountType === "professional") {
    return <ProOwnProfile isLight={isLight} />;
  }

  return <MotoristOwnProfile isLight={isLight} />;
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#c8c9cd] text-sm font-semibold text-slate-800">
          Loading profile…
        </div>
      }
    >
      <ProfileInner />
    </Suspense>
  );
}
