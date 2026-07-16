"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  clearSensitiveUnlock,
  promptSensitivePassword,
} from "@/components/admin/sensitive-unlock";

/**
 * For direct URL visits to 🔒 pages: popup password first, else bounce back.
 * Nav clicks already prompt before navigation via AdminShell.
 */
export function SensitivePageGate({
  pageName,
  children,
}: {
  pageName: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // If already unlocked (just navigated via shell popup), allow
      const status = await fetch("/api/admin/care/status")
        .then((r) => r.json())
        .catch(() => null);
      if (cancelled) return;
      if (status?.ok && status.data?.sensitiveUnlocked) {
        setAllowed(true);
        setChecking(false);
        return;
      }
      const ok = await promptSensitivePassword({
        title: "Password required",
        detail: `Enter the temporary password to open ${pageName}.`,
      });
      if (cancelled) return;
      if (ok) {
        setAllowed(true);
        setChecking(false);
      } else {
        setChecking(false);
        router.replace("/admin");
      }
    })();
    return () => {
      cancelled = true;
      // Leaving the page ends sensitive access
      void clearSensitiveUnlock();
    };
  }, [pageName, router]);

  if (checking) {
    return (
      <p className="om-admin-muted" style={{ padding: "1rem" }}>
        Waiting for password…
      </p>
    );
  }
  if (!allowed) {
    return (
      <p className="om-admin-muted" style={{ padding: "1rem" }}>
        Access denied — returning to dashboard.
      </p>
    );
  }
  return <>{children}</>;
}
