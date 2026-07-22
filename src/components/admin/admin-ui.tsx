"use client";

/**
 * Shared admin UI: file thumbs, detail drawer, tabs, table helpers.
 * Used so Care pages stay consistent and non-overlapping.
 */

import {
  useEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "";
  }
}

export function AdminTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="om-admin-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={cn(
            "om-admin-tab",
            value === t.id && "om-admin-tab-active"
          )}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {typeof t.count === "number" ? (
            <span className="om-admin-tab-count">{t.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Thumbnail for uploaded ID / cert / portfolio — opens full size */
export function FileThumb({
  label,
  url,
  size = "sm",
}: {
  label: string;
  url: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? 160 : size === "md" ? 96 : 48;
  if (!url) {
    return (
      <div
        className="om-admin-file-empty"
        style={{ width: dim, height: Math.round(dim * 0.72) }}
        title={`No ${label}`}
      >
        <span>{label}</span>
      </div>
    );
  }
  const isImage =
    url.startsWith("data:image") ||
    /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(url) ||
    url.includes("image");

  if (!isImage && !url.startsWith("data:")) {
    return (
      <a
        className="om-admin-file-link"
        href={url}
        target="_blank"
        rel="noreferrer"
        title={label}
      >
        📄 {label}
      </a>
    );
  }

  return (
    <a
      className="om-admin-file-thumb"
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`${label} — open full`}
      style={{ width: dim, height: Math.round(dim * 0.72) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} />
      <span className="om-admin-file-caption">{label}</span>
    </a>
  );
}

export function FileThumbRow({
  items,
}: {
  items: { label: string; url: string | null | undefined }[];
}) {
  const hasAny = items.some((i) => i.url);
  if (!hasAny) {
    return <span className="om-admin-muted">No files</span>;
  }
  return (
    <div className="om-admin-file-row">
      {items.map((i) =>
        i.url ? (
          <FileThumb key={i.label} label={i.label} url={i.url} size="sm" />
        ) : null
      )}
    </div>
  );
}

/** Right-side detail drawer for full review + actions */
export function DetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 420,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="om-admin-drawer-root" role="dialog" aria-modal>
      <button
        type="button"
        className="om-admin-drawer-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        className="om-admin-drawer"
        style={{ width: `min(${width}px, 100vw)` } as CSSProperties}
      >
        <header className="om-admin-drawer-head">
          <div className="om-admin-drawer-titles">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="om-admin-btn ghost"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="om-admin-drawer-body">{children}</div>
        {footer ? (
          <footer className="om-admin-drawer-foot">{footer}</footer>
        ) : null}
      </aside>
    </div>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="om-admin-detail-grid">{children}</div>;
}

export function DetailField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  const empty =
    value == null ||
    value === "" ||
    value === "—" ||
    value === "-";
  return (
    <div className="om-admin-detail-field">
      <div className="om-admin-detail-label">{label}</div>
      <div className="om-admin-detail-value">
        {empty ? <span className="om-admin-empty">Not set</span> : value}
      </div>
    </div>
  );
}

export function StatusBadge({
  status,
  children,
}: {
  status?: string;
  children: ReactNode;
}) {
  const s = (status || "").toLowerCase().replace(/\s+/g, "_");
  // Customer approval colors: Approved green · Pending amber · Rejected red
  const tone =
    s === "approved" ||
    s === "verified" ||
    s === "passed" ||
    s === "active" ||
    s === "online" ||
    s === "full" ||
    s === "t2_approved"
      ? "approved"
      : s === "pending" ||
          s === "submitted" ||
          s === "under_review" ||
          s === "draft" ||
          s === "partial" ||
          s === "partial_/_pending" ||
          s === "unattended"
        ? "pending"
        : s === "rejected" ||
            s === "suspended" ||
            s === "failed" ||
            s === "inactive"
          ? "rejected"
          : s === "none" || s === "no_id" || s === "attended" || s === "read"
            ? "neutral"
            : "";
  return (
    <span className={cn("om-admin-badge", tone)}>
      {children}
    </span>
  );
}

/** Scroll wrapper so wide tables never crush columns */
export function AdminTableWrap({ children }: { children: ReactNode }) {
  return <div className="om-admin-table-scroll">{children}</div>;
}
