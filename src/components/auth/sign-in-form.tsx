"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  AuthPlate,
  authBackBtnClass,
  authFieldClass,
  authLabelClass,
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
} from "@/components/auth/auth-plate";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Returning user log-in (email + password against saved profile).
 */
export function SignInForm() {
  const router = useRouter();
  const { userProfile, completeSignup } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!userProfile) {
      setError("No account found on this device. Please sign up.");
      return;
    }
    const em = email.trim().toLowerCase();
    if (
      userProfile.email.trim().toLowerCase() !== em ||
      userProfile.password !== password
    ) {
      setError("Email or password is incorrect.");
      return;
    }
    setBusy(true);
    // Re-apply session (already stored; ensures authenticated state)
    completeSignup(userProfile);
    router.replace(
      userProfile.accountType === "professional" ? "/dashboard" : "/"
    );
  };

  return (
    <AuthPlate>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-5 pt-5">
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.removeItem("oga-mecho-entry-done");
            } catch {
              /* ignore */
            }
            router.push("/login");
          }}
          className={authBackBtnClass}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          Back
        </button>

        <h1 className="text-[22px] font-bold tracking-tight text-[#1e293b]">
          Log In
        </h1>
        <p className="mt-1 text-[13px] text-[#475569]">
          Welcome back to OgaMecho
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-6 flex flex-1 flex-col gap-3.5"
        >
          <label className="block">
            <span className={authLabelClass}>Email</span>
            <input
              className={authFieldClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
            />
          </label>
          <label className="block">
            <span className={authLabelClass}>Password</span>
            <input
              className={authFieldClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error && (
            <p className="text-[12px] font-medium text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={cn(authPrimaryBtnClass, "mt-auto")}
            style={authPrimaryBtnStyle}
          >
            {busy ? "Signing in…" : "Log In"}
          </button>

          <button
            type="button"
            className="text-[13px] font-semibold text-[#e85a12]"
            onClick={() => router.push("/login/role")}
          >
            New here? Sign up
          </button>
        </form>
      </div>
    </AuthPlate>
  );
}
