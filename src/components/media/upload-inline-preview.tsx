"use client";

/**
 * Inline expand preview for verification uploads (user-facing).
 * Images, PDF (iframe), and video — no modal; expands under the upload row.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, FileText, Film, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadMediaKind = "image" | "pdf" | "video" | "unknown";

export function detectUploadMediaKind(
  url: string | null | undefined,
  mime?: string | null,
  name?: string | null
): UploadMediaKind {
  const m = (mime || "").toLowerCase();
  const u = (url || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (
    m.startsWith("video/") ||
    u.startsWith("data:video") ||
    /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u) ||
    /\.(mp4|webm|mov|m4v|ogg)$/i.test(n)
  ) {
    return "video";
  }
  if (
    m.includes("pdf") ||
    u.includes("application/pdf") ||
    u.startsWith("data:application/pdf") ||
    /\.pdf(\?|$)/i.test(u) ||
    n.endsWith(".pdf")
  ) {
    return "pdf";
  }
  if (
    m.startsWith("image/") ||
    u.startsWith("data:image") ||
    /\.(jpe?g|png|gif|webp|heic|bmp)(\?|$)/i.test(u) ||
    /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(n)
  ) {
    return "image";
  }
  // data URLs without mime hints — prefer image for photo ID flows
  if (u.startsWith("data:")) return "image";
  if (u) return "image";
  return "unknown";
}

export function UploadInlinePreview({
  url,
  label,
  mime,
  fileName,
  isLight,
  defaultOpen = false,
  className,
}: {
  url: string | null | undefined;
  label?: string;
  mime?: string | null;
  fileName?: string | null;
  isLight: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const kind = useMemo(
    () => detectUploadMediaKind(url, mime, fileName),
    [url, mime, fileName]
  );

  if (!url) return null;

  const muted = isLight ? "text-slate-600" : "text-white/65";
  const ink = isLight ? "text-slate-900" : "text-white";
  const surface = isLight ? "bg-black/[0.06]" : "bg-white/[0.08]";

  const KindIcon =
    kind === "video" ? Film : kind === "pdf" ? FileText : ImageIcon;

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border-0 px-3 py-2 text-left",
          surface
        )}
        aria-expanded={open}
      >
        <span className={cn("flex min-w-0 items-center gap-2 text-[12px] font-bold", ink)}>
          {open ? (
            <EyeOff className="h-3.5 w-3.5 shrink-0 text-[#FF6B35]" />
          ) : (
            <Eye className="h-3.5 w-3.5 shrink-0 text-[#FF6B35]" />
          )}
          <KindIcon className={cn("h-3.5 w-3.5 shrink-0", muted)} />
          <span className="truncate">
            {open ? "Hide preview" : "Preview"}
            {label ? ` · ${label}` : ""}
            {fileName ? ` · ${fileName}` : ""}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            open && "rotate-180",
            muted
          )}
        />
      </button>

      {open ? (
        <div
          className={cn(
            "mt-1.5 overflow-hidden rounded-md border-0",
            surface
          )}
        >
          {kind === "video" ? (
            <video
              src={url}
              controls
              playsInline
              className="max-h-56 w-full bg-black object-contain"
              preload="metadata"
            >
              Your browser cannot play this video.
            </video>
          ) : kind === "pdf" ? (
            <iframe
              title={label || fileName || "PDF preview"}
              src={url}
              className="h-64 w-full bg-white"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async"
              src={url}
              alt={label || fileName || "Upload preview"}
              className="max-h-56 w-full object-contain"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
