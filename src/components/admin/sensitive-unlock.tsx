"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Routes that require password popup *before* navigation */
export const PASSWORD_GATED_PATHS = [
  "/admin/settings",
  "/admin/features",
] as const;

export function isPasswordGatedPath(href: string): boolean {
  const path = href.split("?")[0].split("#")[0];
  return PASSWORD_GATED_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
}

/** Super Admin skips the temporary password entirely. */
async function isSuperAdminSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/auth/me", {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    return Boolean(
      json?.ok &&
        (json.data?.adminRole === "super_admin" ||
          json.data?.role === "admin" ||
          json.data?.role === "super_admin")
    );
  } catch {
    return false;
  }
}

async function postUnlock(password: string): Promise<
  | { ok: true; expiresAt: number | null }
  | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/admin/care/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!json.ok) {
      return {
        ok: false,
        message: json.error?.message || "Invalid password",
      };
    }
    return { ok: true, expiresAt: json.data?.expiresAt ?? null };
  } catch {
    return { ok: false, message: "Network error" };
  }
}

export async function clearSensitiveUnlock(): Promise<void> {
  try {
    await fetch("/api/admin/care/unlock", { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

type ModalState = {
  title: string;
  detail: string;
  resolve: (ok: boolean) => void;
} | null;

/**
 * Global password popup for sensitive admin pages / actions.
 * Use: const ok = await promptSensitivePassword({ title, detail })
 */
let openPrompt:
  | ((opts: { title: string; detail?: string }) => Promise<boolean>)
  | null = null;

export async function promptSensitivePassword(opts: {
  title: string;
  detail?: string;
}): Promise<boolean> {
  // Super Admin: no temporary password gate
  if (await isSuperAdminSession()) return true;
  if (!openPrompt) {
    console.warn("[sensitive] Password modal not mounted");
    return Promise.resolve(false);
  }
  return openPrompt(opts);
}

/**
 * Unlock with popup, run fn, then re-lock (one-shot for money/freeze actions).
 * Super Admin runs fn immediately without popup.
 */
export async function withSensitivePassword(
  opts: { title: string; detail?: string },
  fn: () => Promise<void>
): Promise<boolean> {
  if (await isSuperAdminSession()) {
    await fn();
    return true;
  }
  const ok = await promptSensitivePassword(opts);
  if (!ok) return false;
  try {
    await fn();
    return true;
  } finally {
    await clearSensitiveUnlock();
  }
}

/** Mount once inside AdminShell — provides the popup host */
export function SensitivePasswordHost() {
  const [modal, setModal] = useState<ModalState>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    openPrompt = (opts) =>
      new Promise<boolean>((resolve) => {
        setPassword("");
        setErr(null);
        setBusy(false);
        setModal({
          title: opts.title,
          detail:
            opts.detail ||
            "Enter the temporary staff password to continue. Super Admin does not need this.",
          resolve,
        });
      });
    return () => {
      openPrompt = null;
    };
  }, []);

  useEffect(() => {
    if (modal) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [modal]);

  const close = useCallback((ok: boolean) => {
    setModal((m) => {
      m?.resolve(ok);
      return null;
    });
    setPassword("");
    setErr(null);
    setBusy(false);
  }, []);

  const submit = useCallback(async () => {
    if (!modal || !password.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await postUnlock(password.trim());
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    close(true);
  }, [modal, password, close]);

  if (!modal) return null;

  return (
    <div
      className="om-admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="om-sensitive-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div className="om-admin-modal">
        <h2 id="om-sensitive-title" className="om-admin-modal-title">
          {modal.title}
        </h2>
        <p className="om-admin-muted" style={{ margin: "0 0 1rem" }}>
          {modal.detail}
        </p>
        <label className="om-admin-muted" style={{ display: "block", marginBottom: 6 }}>
          Temporary password
        </label>
        <input
          ref={inputRef}
          type="password"
          className="om-admin-input"
          value={password}
          autoComplete="off"
          placeholder="Required"
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") close(false);
          }}
          style={{ width: "100%", marginBottom: "0.75rem" }}
        />
        {err ? (
          <div className="om-admin-error" style={{ marginBottom: "0.75rem" }}>
            {err}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="om-admin-btn ghost"
            disabled={busy}
            onClick={() => close(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="om-admin-btn"
            disabled={busy || !password.trim()}
            onClick={() => void submit()}
          >
            {busy ? "Checking…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use promptSensitivePassword / withSensitivePassword */
export function SensitiveUnlockBar(_props: {
  unlocked: boolean;
  expiresAt: number | null;
  onChange: (state: { unlocked: boolean; expiresAt: number | null }) => void;
}): ReactNode {
  return null;
}
