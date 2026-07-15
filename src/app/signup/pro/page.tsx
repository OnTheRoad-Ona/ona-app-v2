"use client";

import { Suspense } from "react";
import { ProSignup } from "@/components/auth/pro-signup";

export default function ProSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#c8c9cd] text-sm font-semibold text-slate-700">
          Loading Repair Pro signup…
        </div>
      }
    >
      <ProSignup />
    </Suspense>
  );
}
