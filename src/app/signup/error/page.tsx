"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  AUTH_BG,
  AuthPlate,
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
  authSecondaryBtnClass,
} from "@/components/auth/auth-plate";

/** Short user-facing copy for common server errors */
function simpleMessage(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("pro_service") || m.includes("invalid input value for enum")) {
    return "This trade is not enabled on the server yet. Try again after an update, or pick another trade.";
  }
  if (m.includes("not signed in") || m.includes("not authenticated")) {
    return "Sign-up did not finish. Try again.";
  }
  if (m.includes("already") && (m.includes("phone") || m.includes("email"))) {
    return "This phone or email is already registered. Log in instead.";
  }
  if (m.includes("password")) {
    return "Check your password and try again.";
  }
  // Keep short strip long technical dumps
  const one = raw.split(/[.\n]/)[0]?.trim() || raw;
  return one.length > 120
    ? `${one.slice(0, 117)}…`
    : one || "Sign-up failed. Try again.";
}

function SignupErrorBody() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("message") || "Sign-up failed. Please try again.";
  const message = simpleMessage(raw);
  const role = params.get("role") || "motorist";

  return (
    <AuthPlate>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center">
        <div
          className="w-full max-w-[300px] rounded-3xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-black/10"
          style={{ backgroundColor: AUTH_BG }}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fef2f2]">
            <AlertTriangle className="h-7 w-7 text-[#dc2626]" strokeWidth={2} />
          </div>
          <h1 className="mt-3 text-[17px] font-bold text-[#1e293b]">
            Sign-up failed
          </h1>
          <p className="mt-3 rounded-xl bg-[#fef2f2] px-3 py-2.5 text-left text-[13px] font-medium leading-snug text-[#991b1b]">
            {message}
          </p>
          <button
            type="button"
            className={`${authPrimaryBtnClass} mt-4 h-11 rounded-2xl text-[13px] font-bold`}
            style={authPrimaryBtnStyle}
            onClick={() =>
              router.replace(
                role === "professional" ? "/signup/pro" : "/signup/motorist",
              )
            }
          >
            Try again
          </button>
          <button
            type="button"
            className={`${authSecondaryBtnClass} mt-2 h-10 rounded-2xl text-[13px] font-semibold`}
            onClick={() => router.replace("/login/signin")}
          >
            Log in
          </button>
          <button
            type="button"
            className="mt-3 text-[12px] font-semibold text-[#64748b] underline"
            onClick={() => router.replace("/login")}
          >
            Back
          </button>
        </div>
      </div>
    </AuthPlate>
  );
}

export default function SignupErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-black text-sm text-white">
          Loading…
        </div>
      }
    >
      <SignupErrorBody />
    </Suspense>
  );
}
