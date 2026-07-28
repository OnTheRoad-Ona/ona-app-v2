"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const UNRECOVERABLE_KEYWORDS = [
  "supabase",
  "not configured",
  "network error",
  "failed to fetch",
  "database",
  "schema",
  "connection refused",
];

function isUnrecoverable(msg: string): boolean {
  return UNRECOVERABLE_KEYWORDS.some((k) => msg.toLowerCase().includes(k));
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [redirectSec, setRedirectSec] = useState(0);
  const msg = error?.message ?? "";
  const unrecoverable = isUnrecoverable(msg);

  useEffect(() => {
    if (!unrecoverable) return;
    setRedirectSec(5);
    const t = setInterval(() => {
      setRedirectSec((s) => {
        if (s <= 1) {
          clearInterval(t);
          router.replace("/dashboard");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [unrecoverable, router]);

  return (
    <div
      className="flex min-h-[100vh] min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center text-white"
      role="alert"
    >
      <p className="text-[22px] font-black tracking-tight" aria-label="Ona">
        <span className="text-[#FF6B35]">O</span>
        <span className="text-[#C8C9CD]">na</span>
      </p>
      <p className="max-w-xs text-[14px] font-medium text-white/80">
        {unrecoverable
          ? "This can't be recovered right now."
          : "Something went wrong. Check your connection and try again."}
      </p>
      {msg ? (
        <p className="max-w-xs break-words text-[11px] text-white/40">
          {msg.slice(0, 160)}
        </p>
      ) : null}
      {!unrecoverable ? (
        <button
          type="button"
          onClick={() => reset()}
          className="mt-2 h-11 rounded-md border-0 bg-[#2c2c2e] px-6 text-[14px] font-semibold text-white"
        >
          Try again
        </button>
      ) : null}
      <a
        href="/"
        className="text-[13px] font-semibold text-[#FF6B35] no-underline"
      >
        {unrecoverable && redirectSec > 0
          ? `Go home (${redirectSec}s)`
          : "Go home"}
      </a>
    </div>
  );
}
