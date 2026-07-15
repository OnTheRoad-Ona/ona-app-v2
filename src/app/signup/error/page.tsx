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

function SignupErrorBody() {
  const router = useRouter();
  const params = useSearchParams();
  const message =
    params.get("message") ||
    "Your account was not registered on OgaMecho servers. Please try again.";
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
            Registration failed
          </h1>
          <p className="mt-2 text-[12px] leading-relaxed text-[#64748b]">
            You are <strong>not signed in</strong>. The homepage stays locked
            until your account is saved on OgaMecho servers.
          </p>
          <p className="mt-3 rounded-xl bg-[#fef2f2] px-3 py-2.5 text-left text-[12px] font-medium text-[#991b1b]">
            {message}
          </p>
          <button
            type="button"
            className={`${authPrimaryBtnClass} mt-4 h-11 rounded-2xl text-[13px] font-bold`}
            style={authPrimaryBtnStyle}
            onClick={() =>
              router.replace(
                role === "professional" ? "/signup/pro" : "/signup/motorist"
              )
            }
          >
            Try sign up again
          </button>
          <button
            type="button"
            className={`${authSecondaryBtnClass} mt-2 h-10 rounded-2xl text-[13px] font-semibold`}
            onClick={() => router.replace("/login/signin")}
          >
            Log in instead
          </button>
          <button
            type="button"
            className="mt-3 text-[12px] font-semibold text-[#64748b] underline"
            onClick={() => router.replace("/login")}
          >
            Back to start
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
        <div className="flex h-full items-center justify-center bg-black text-white text-sm">
          Loading…
        </div>
      }
    >
      <SignupErrorBody />
    </Suspense>
  );
}
