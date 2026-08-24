"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[100vh] min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center text-white">
      <p className="text-[22px] font-black tracking-tight" aria-label="Ona">
        <span className="text-[#FF6B35]">O</span>
        <span className="text-[#C8C9CD]">na</span>
      </p>
      <p className="max-w-xs text-[14px] font-medium text-white/80">
        Page not found
      </p>
      <p className="max-w-xs text-[11px] text-white/40">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-2 text-[13px] font-semibold text-[#FF6B35] no-underline"
      >
        Go home
      </Link>
    </div>
  );
}
