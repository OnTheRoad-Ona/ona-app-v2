"use client";

/**
 * Route-level error UI — prevents a blank black screen on mobile crashes.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="flex min-h-[100vh] min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center text-white"
      role="alert"
    >
      <p className="text-[18px] font-bold tracking-tight">
        <span className="text-[#e85a12]">Oga</span>Mecho
      </p>
      <p className="max-w-xs text-[14px] font-medium text-white/80">
        Something went wrong while loading. Check your connection and try
        again.
      </p>
      {error?.message ? (
        <p className="max-w-xs break-words text-[11px] text-white/40">
          {error.message.slice(0, 160)}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-2 h-11 rounded-md border-0 bg-[#2c2c2e] px-6 text-[14px] font-semibold text-white"
      >
        Try again
      </button>
      <a
        href="/"
        className="text-[13px] font-semibold text-[#e07a3d] no-underline"
      >
        Go home
      </a>
    </div>
  );
}
