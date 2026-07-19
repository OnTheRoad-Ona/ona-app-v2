"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { navigateBack } from "@/lib/navigation";
import { profileTheme } from "@/lib/profile-system";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ProfileShell({
  isLight,
  title,
  children,
  showEdit,
  onEdit,
  footer,
  loading,
  error,
}: {
  isLight: boolean;
  title: string;
  children?: React.ReactNode;
  showEdit?: boolean;
  onEdit?: () => void;
  footer?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
}) {
  const router = useRouter();
  const { accountType } = useApp();
  const t = profileTheme(isLight);

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", t.sheet)}
      style={{ backgroundColor: t.sheetBg }}
    >
      <header
        className="flex shrink-0 items-center gap-2 px-2.5 pb-1.5 pt-2.5"
        style={{ backgroundColor: t.sheetBg }}
      >
        <button
          type="button"
          onClick={() =>
            navigateBack(
              router,
              accountType === "professional" ? "/dashboard" : "/",
              accountType
            )
          }
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border-0",
            isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
          )}
          style={{
            backgroundColor: isLight ? "#c8c9cd" : "#000000",
          }}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className={cn("min-w-0 flex-1 truncate text-[15px] font-bold", t.ink)}>
          {title}
        </h1>
        {showEdit && (
          <button
            type="button"
            onClick={onEdit}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg border-0 px-2.5 text-[11px] font-bold",
              isLight ? "bg-transparent text-slate-900" : "bg-[#2c2c2e] text-white"
            )}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 scrollbar-hide"
        style={{ backgroundColor: t.sheetBg }}
      >
        {loading && (
          <div className="space-y-2 py-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-20 animate-pulse rounded-2xl",
                  isLight ? "bg-black/10" : "bg-[#1c1c1e]"
                )}
              />
            ))}
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl bg-red-500/15 px-3 py-3 text-[12px] font-semibold text-red-400">
            {error}
          </div>
        )}
        {!loading && !error && children}
      </div>

      {footer && (
        <div
          className="shrink-0 space-y-1.5 px-3 pb-3 pt-2"
          style={{ backgroundColor: t.sheetBg }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export function ProfileSection({
  title,
  isLight,
  children,
  action,
}: {
  title?: string;
  isLight: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const t = profileTheme(isLight);
  return (
    <section
      className={cn(
        "mb-1 space-y-2 px-0 py-2.5",
        isLight
          ? "border-b border-black/10 last:border-b-0"
          : "mb-1.5 rounded-2xl px-3 py-3"
      )}
      style={isLight ? undefined : { backgroundColor: t.cardBg }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <p className={cn("text-[13px] font-bold", t.ink)}>{title}</p>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
