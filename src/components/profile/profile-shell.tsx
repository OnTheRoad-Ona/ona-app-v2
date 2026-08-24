"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { defaultBackHref, navigateBack } from "@/lib/navigation";
import { profileTheme } from "@/lib/profile-system";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Own-profile chrome X-style flat layout.
 * Page stage only. No section cards, nested panels, glow, or gradient.
 */
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
        className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-2.5"
        style={{ backgroundColor: t.sheetBg }}
      >
        <button
          type="button"
          onClick={() =>
            navigateBack(router, defaultBackHref(accountType), accountType)
          }
          className={cn(
            "flex h-8 w-8 items-center justify-center border-0 bg-transparent",
            t.ink,
          )}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <h1
          className={cn(
            "min-w-0 flex-1 truncate text-center text-[16px] font-bold",
            t.ink,
          )}
        >
          {title}
        </h1>
        {showEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className={cn(
              "inline-flex h-8 items-center gap-1 border-0 bg-transparent px-1 text-[13px] font-bold text-[#FF6B35]",
            )}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
            Edit
          </button>
        ) : (
          <span className="w-8" aria-hidden />
        )}
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 scrollbar-hide"
        style={{ backgroundColor: t.sheetBg }}
      >
        {loading && (
          <div className="space-y-4 py-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-12 animate-pulse",
                  isLight ? "bg-black/10" : "bg-white/10",
                )}
              />
            ))}
          </div>
        )}
        {error && !loading && (
          <div className="py-3 text-[13px] font-semibold text-red-500">
            {error}
          </div>
        )}
        {!loading && !error && children}
      </div>

      {footer && (
        <div
          className="shrink-0 space-y-1.5 px-4 pb-3 pt-2"
          style={{ backgroundColor: t.sheetBg }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * Flat section: title + content. No card fill, no nested panel background.
 */
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
  const hair = isLight ? "border-black/12" : "border-white/12";
  return (
    <section className={cn("mb-0 border-b py-4", hair)}>
      {(title || action) && (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          {title ? (
            <p
              className={cn(
                "text-[12px] font-bold uppercase tracking-[0.12em]",
                t.muted,
              )}
            >
              {title}
            </p>
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

/**
 * X-style identity stack: large avatar, name, role, meta flat on stage.
 */
export function ProfileIdentityHeader({
  isLight,
  avatar,
  name,
  roleLabel,
  meta,
  badge,
}: {
  isLight: boolean;
  avatar: React.ReactNode;
  name: string;
  roleLabel: string;
  meta?: string;
  badge?: React.ReactNode;
}) {
  const t = profileTheme(isLight);
  return (
    <div className="pb-5 pt-2">
      <div className="flex items-end gap-3">
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1 pb-1">
          <p
            className={cn(
              "flex flex-wrap items-center gap-1.5 text-[20px] font-black leading-tight tracking-tight",
              t.ink,
            )}
          >
            <span className="truncate">{name}</span>
            {badge}
          </p>
          <p className={cn("mt-0.5 text-[14px] font-semibold", t.muted)}>
            {roleLabel}
          </p>
          {meta ? (
            <p className={cn("mt-1 text-[12px] font-medium", t.muted)}>
              {meta}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
