"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("Oluwatosinabdullahime@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Login failed");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="om-admin-login">
      <form className="om-admin-form" onSubmit={onSubmit}>
        <div>
          <div className="om-admin-brand" style={{ marginBottom: 8 }}>
            <span className="om-admin-brand-mark" aria-hidden />
            Ona Control Centre
          </div>
          <h1 className="om-admin-h1" style={{ fontSize: "1.25rem" }}>
            Staff sign in
          </h1>
          <p className="om-admin-sub">
            Super Admin, Customer Care, and Support — one console that controls
            the live Ona app.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
            }}
          >
            <span
              className="om-admin-role-chip om-admin-role-chip--inline"
              style={{ background: "#1a1b1e", color: "#fff" }}
            >
              Super Admin
            </span>
            <span
              className="om-admin-role-chip om-admin-role-chip--inline"
              style={{ background: "#0f766e", color: "#fff" }}
            >
              Customer Care
            </span>
            <span
              className="om-admin-role-chip om-admin-role-chip--inline"
              style={{ background: "#1d4ed8", color: "#fff" }}
            >
              Support
            </span>
          </div>
        </div>
        {error ? <div className="om-admin-error">{error}</div> : null}
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="om-admin-btn" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="om-admin-muted">
          Public app stays separate. This panel manages users, jobs, escrow &
          settings.
        </p>
      </form>
    </div>
  );
}
