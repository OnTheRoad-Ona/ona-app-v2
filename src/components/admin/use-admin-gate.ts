"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminRoleLabel,
  normalizeAdminRoleUi,
  type AdminRoleUi,
} from "@/lib/admin-role-ui";

export function useAdminGate() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [adminRole, setAdminRole] = useState<AdminRoleUi>("super_admin");
  const [roleLabel, setRoleLabel] = useState("Super Admin");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/admin/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        const meJson = await me.json();
        if (!meJson.ok) {
          router.replace("/admin/login");
          return;
        }
        if (!cancelled) {
          setAdminName(meJson.data.fullName || meJson.data.email || "Admin");
          const role = normalizeAdminRoleUi(
            meJson.data.adminRole || meJson.data.role
          );
          setAdminRole(role);
          setRoleLabel(meJson.data.roleLabel || adminRoleLabel(role));
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

  const api = useCallback(
    async <T,>(
      path: string,
      init?: RequestInit
    ): Promise<
      | { ok: true; data: T }
      | { ok: false; message: string; status: number; code?: string }
    > => {
      try {
        const res = await fetch(path, {
          ...init,
          credentials: "include",
        });
        const json = await res.json();
        if (!json.ok) {
          if (res.status === 401) {
            router.replace("/admin/login");
          }
          return {
            ok: false,
            message: json.error?.message || "Request failed",
            status: res.status,
            code: json.error?.code as string | undefined,
          };
        }
        return { ok: true, data: json.data as T };
      } catch {
        return { ok: false, message: "Network error", status: 0 };
      }
    },
    [router]
  );

  return {
    adminName,
    adminRole,
    roleLabel,
    ready,
    error,
    setError,
    api,
    router,
  };
}
