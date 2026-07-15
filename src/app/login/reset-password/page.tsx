"use client";

import { useEffect, useState } from "react";
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

/**
 * Landing page from Supabase recovery email.
 * Tokens arrive in the URL hash: #access_token=…&refresh_token=…&type=recovery
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access = params.get("access_token") || "";
      const refresh = params.get("refresh_token") || "";
      const type = params.get("type") || "";
      if (access && refresh) {
        setAccessToken(access);
        setRefreshToken(refresh);
        setReady(true);
        if (type && type !== "recovery") {
          setInfo("You can set a new password for this account.");
        }
      } else {
        setError(
          "This reset link is invalid or incomplete. Request a new one from Log In → Forgot password."
        );
      }
    } catch {
      setError("Could not read reset link.");
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!accessToken || !refreshToken) {
      setError("Missing reset session. Request a new link.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          password,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.error?.message || "Could not update password.");
        return;
      }
      setInfo("Password updated. Redirecting to log in…");
      window.setTimeout(() => router.replace("/login/signin"), 1200);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPlate>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-5 pt-5">
        <button
          type="button"
          onClick={() => router.push("/login/signin")}
          className={authBackBtnClass}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          Back to log in
        </button>

        <h1 className="text-[22px] font-bold tracking-tight text-[#1e293b]">
          Set new password
        </h1>
        <p className="mt-1 text-[13px] text-[#475569]">
          Choose a new password for your OgaMecho account.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-6 flex flex-1 flex-col gap-3.5"
        >
          <label className="block">
            <span className={authLabelClass}>New password</span>
            <input
              className={authFieldClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              disabled={!ready}
            />
          </label>
          <label className="block">
            <span className={authLabelClass}>Confirm password</span>
            <input
              className={authFieldClass}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              disabled={!ready}
            />
          </label>

          {error ? (
            <p className="text-[12px] font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="text-[12px] font-medium text-emerald-700" role="status">
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !ready}
            className={`${authPrimaryBtnClass} mt-auto h-11 rounded-md text-[14px] font-bold`}
            style={authPrimaryBtnStyle}
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </AuthPlate>
  );
}
