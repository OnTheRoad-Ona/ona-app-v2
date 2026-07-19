"use client";

import { Suspense } from "react";
import { MotoristSignup } from "@/components/auth/motorist-signup";

export default function MotoristSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#c8c9cd] text-sm font-semibold text-slate-700">
          Loading Motorist signup…
        </div>
      }
    >
      <MotoristSignup />
    </Suspense>
  );
}
