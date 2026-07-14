"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useAdminGate() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/admin/auth/me");
        const meJson = await me.json();
        if (!meJson.ok) {
          router.replace("/admin/login");
          return;
        }
        if (!cancelled) {
          setAdminName(meJson.data.fullName || meJson.data.email || "Admin");
          setReady(true);
        }
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const api = useCallback(async <T,>(
    path: string,
    init?: RequestInit
  ): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> => {
    try {
      const res = await fetch(path, init);
      const json = await res.json();
      if (!json.ok) {
        if (res.status === 401 || res.status === 403) {
          router.replace("/admin/login");
        }
        return {
          ok: false,
          message: json.error?.message || "Request failed",
          status: res.status,
        };
      }
      return { ok: true, data: json.data as T };
    } catch {
      return { ok: false, message: "Network error", status: 0 };
    }
  }, [router]);

  return { adminName, ready, error, setError, api, router };
}
