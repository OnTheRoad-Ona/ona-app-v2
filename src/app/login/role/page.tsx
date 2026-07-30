"use client";

import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/login-screen";

/** Sign-up: choose Motorist or Repair Pro */
export default function SignUpRolePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center p-8 text-sm text-white/50">Loading…</div>}>
      <LoginScreen />
    </Suspense>
  );
}
