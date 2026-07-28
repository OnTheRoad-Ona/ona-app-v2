"use client";

/**
 * Shared admin UI: file thumbs, detail drawer, tabs, table helpers.
 * Used so Care pages stay consistent and non-overlapping.
 */

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const DOC_CACHE_DB = "ona-admin-docs";
const DOC_CACHE_STORE = "files";

function cacheKey(url: string) {
  return url.slice(0, 500);
}

async function openDocDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DOC_CACHE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DOC_CACHE_STORE)) {
          db.createObjectStore(DOC_CACHE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Read cached blob URL for offline reopen; null if missing. */
async function readCachedDoc(url: string): Promise<string | null> {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const db = await openDocDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DOC_CACHE_STORE, "readonly");
      const store = tx.objectStore(DOC_CACHE_STORE);
      const g = store.get(cacheKey(url));
      g.onsuccess = () => {
        const blob = g.result as Blob | undefined;
        if (blob instanceof Blob) resolve(URL.createObjectURL(blob));
        else resolve(null);
      };
      g.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Prefer admin proxy for private storage / CORS; fall back to direct URL. */
function proxyDocUrl(url: string, userId?: string | null, kind?: string): string {
  if (!url) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const q = new URLSearchParams();
  if (userId && kind) {
    q.set("userId", userId);
    q.set("kind", kind);
  } else {
    q.set("url", url);
  }
  return `/api/admin/docs?${q.toString()}`;
}

/** Download once online and store for offline viewing. */
async function cacheDocUrl(
  url: string,
  opts?: { userId?: string | null; kind?: string }
): Promise<string | null> {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const candidates = [
    proxyDocUrl(url, opts?.userId, opts?.kind),
    url,
  ];
  for (const fetchUrl of candidates) {
    try {
      const res = await fetch(fetchUrl, {
        mode: "cors",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size < 8) continue;
      const db = await openDocDb();
      if (db) {
        await new Promise<void>((resolve) => {
          try {
            const tx = db.transaction(DOC_CACHE_STORE, "readwrite");
            tx.objectStore(DOC_CACHE_STORE).put(blob, cacheKey(url));
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch {
            resolve();
          }
        });
      }
      return URL.createObjectURL(blob);
    } catch {
      /* try next */
    }
  }
  return null;
}

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

/** Thumbnail for uploaded ID / cert / portfolio — caches on open for offline view */
export function FileThumb({
  label,
  url,
  size = "sm",
  userId,
  kind,
}: {
  label: string;
  url: string | null | undefined;
  size?: "sm" | "md" | "lg";
  /** When set with kind, admin proxy loads from DB even if raw URL fails */
  userId?: string | null;
  kind?: "front" | "back" | "pro_front" | "pro_back" | "skill";
}) {
  const dim = size === "lg" ? 160 : size === "md" ? 96 : 48;
  const [src, setSrc] = useState<string | null>(url || null);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url && !(userId && kind)) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    setFailed(false);
    const initial =
      url && (url.startsWith("data:") || url.startsWith("blob:"))
        ? url
        : url
          ? proxyDocUrl(url, userId, kind)
          : userId && kind
            ? `/api/admin/docs?userId=${encodeURIComponent(userId)}&kind=${encodeURIComponent(kind)}`
            : null;
    setSrc(initial);
    void (async () => {
      if (url) {
        const cached = await readCachedDoc(url);
        if (cancelled) return;
        if (cached) {
          setSrc(cached);
          setOffline(true);
          return;
        }
      }
      const fresh = await cacheDocUrl(url || "", { userId, kind });
      if (cancelled) return;
      if (fresh) {
        setSrc(fresh);
        setOffline(true);
      } else if (!initial) {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, userId, kind]);

  if (!url && !(userId && kind)) {
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
  const view =
    src ||
    (url
      ? proxyDocUrl(url, userId, kind)
      : userId && kind
        ? `/api/admin/docs?userId=${encodeURIComponent(userId)}&kind=${encodeURIComponent(kind)}`
        : "");
  const isImage =
    view.startsWith("data:image") ||
    view.startsWith("blob:") ||
    (url &&
      (/\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(url) ||
        url.includes("image") ||
        url.startsWith("data:image")));

  if (failed && !view) {
    return (
      <div
        className="om-admin-file-empty"
        style={{ width: dim, height: Math.round(dim * 0.72) }}
      >
        <span>{label} failed</span>
      </div>
    );
  }

  if (!isImage && view && !view.startsWith("data:image")) {
    return (
      <a
        className="om-admin-file-link"
        href={view}
        target="_blank"
        rel="noreferrer"
        title={
          offline
            ? `${label} (view only · offline)`
            : `View ${label} (Admin / Care only · no download)`
        }
      >
        📄 {label}
        {offline ? " · offline" : " · view"}
      </a>
    );
  }

  return (
    <a
      className="om-admin-file-thumb"
      href={view}
      target="_blank"
      rel="noreferrer"
      title={`${label}${offline ? " · offline" : ""} · view only (no download)`}
      style={{ width: dim, height: Math.round(dim * 0.72) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={view}
        alt={label}
        onError={() => {
          // Last resort: try proxy by userId
          if (userId && kind) {
            setSrc(
              `/api/admin/docs?userId=${encodeURIComponent(userId)}&kind=${encodeURIComponent(kind)}&t=${Date.now()}`
            );
          } else {
            setFailed(true);
          }
        }}
      />
      <span className="om-admin-file-caption">
        {label}
        {offline ? " · offline" : ""}
      </span>
    </a>
  );
}

export function FileThumbRow({
  items,
  userId,
}: {
  items: {
    label: string;
    url: string | null | undefined;
    kind?: "front" | "back" | "pro_front" | "pro_back" | "skill";
  }[];
  userId?: string | null;
}) {
  const hasAny = items.some((i) => i.url);
  if (!hasAny) {
    return <span className="om-admin-muted">No files</span>;
  }
  return (
    <div className="om-admin-file-row">
      {items.map((i) =>
        i.url ? (
          <FileThumb
            key={i.label}
            label={i.label}
            url={i.url}
            size="sm"
            userId={userId}
            kind={
              i.kind ||
              (i.label.toLowerCase().includes("back") ? "back" : "front")
            }
          />
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
