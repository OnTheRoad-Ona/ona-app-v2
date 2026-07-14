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
          <div className="om-admin-brand">
            Oga<span>Mecho</span> Admin
          </div>
          <h1 className="om-admin-h1" style={{ fontSize: "1.25rem" }}>
            Sign in
          </h1>
          <p className="om-admin-sub">
            Full control of the OgaMecho app — light grey console
          </p>
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
          Seed admin only. Public app stays on port 3000.
        </p>
      </form>
    </div>
  );
}
