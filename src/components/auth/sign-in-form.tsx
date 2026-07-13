"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  AuthPlate,
  authBackBtnClass,
  authFieldClass,
  authLabelClass,
} from "@/components/auth/auth-plate";
import { useApp } from "@/lib/store";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Returning user log-in — each Motorist / Repair Pro account is separate.
 */
export function SignInForm() {
  const router = useRouter();
  const { signInWithPassword, hasMotoristAccount, hasProAccount } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [preferType, setPreferType] = useState<AccountType | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
          Welcome back. Motorist and Repair Pro each need their own login.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            if (!hasMotoristAccount && !hasProAccount) {
              setError("No account found on this device. Please sign up.");
              return;
            }
            setBusy(true);
            const err = signInWithPassword(
              email,
              password,
              preferType || undefined
            );
            if (err) {
              setError(err);
              setBusy(false);
              return;
            }
            const t =
              preferType ||
              localStorage.getItem("oga-mecho-account-type") ||
              "motorist";
            router.replace(t === "professional" ? "/dashboard" : "/");
            setBusy(false);
          }}
          className="mt-6 flex flex-1 flex-col gap-3.5"
        >
          {(hasMotoristAccount || hasProAccount) && (
            <div>
              <span className={authLabelClass}>Log in as</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setPreferType((p) => (p === "motorist" ? "" : "motorist"))
                  }
                  className={cn(
                    "h-10 rounded-md border-0 text-[12px] font-bold",
                    preferType === "motorist"
                      ? "bg-[#323231] text-white"
                      : "bg-black/[0.06] text-[#1e293b]",
                    !hasMotoristAccount && "opacity-40"
                  )}
                  disabled={!hasMotoristAccount}
                >
                  Motorist
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPreferType((p) =>
                      p === "professional" ? "" : "professional"
                    )
                  }
                  className={cn(
                    "h-10 rounded-md border-0 text-[12px] font-bold",
                    preferType === "professional"
                      ? "bg-[#323231] text-white"
                      : "bg-black/[0.06] text-[#1e293b]",
                    !hasProAccount && "opacity-40"
                  )}
                  disabled={!hasProAccount}
                >
                  Repair Pro
                </button>
              </div>
            </div>
          )}

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
            className="om-cta-dark-gray mt-auto"
            style={{
              WebkitAppearance: "none",
              appearance: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: 44,
              border: "none",
              borderRadius: 6,
              background: "#323231",
              backgroundColor: "#323231",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              cursor: busy ? "wait" : "pointer",
            }}
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
