"use client";

import { CheckCircle2 } from "lucide-react";
import {
  AUTH_BG,
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
} from "@/components/auth/auth-plate";

/** Simple success dialog — login fill card + wheel-gray CTA */
export function RegistrationComplete({
  open,
  accountLabel,
  onContinue,
}: {
  open: boolean;
  accountLabel: string;
  onContinue: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[400] flex items-center justify-center bg-black/30 px-6"
      role="dialog"
      aria-modal
      aria-labelledby="reg-complete-title"
    >
      <div
        className="w-full max-w-[280px] rounded-3xl p-5 text-center shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-black/10"
        style={{ backgroundColor: AUTH_BG }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f8ef]">
          <CheckCircle2 className="h-7 w-7 text-[#34c759]" strokeWidth={2} />
        </div>
        <h2
          id="reg-complete-title"
          className="mt-2.5 text-[16px] font-bold text-[#1e293b]"
        >
          Registration complete
        </h2>
        <p className="mt-1 text-[12px] text-[#64748b]">
          Your {accountLabel} account is ready.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className={`${authPrimaryBtnClass} mt-4 h-10 rounded-2xl text-[13px] font-bold`}
          style={authPrimaryBtnStyle}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
