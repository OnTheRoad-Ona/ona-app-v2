"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { avatarInitials } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Customer photos in a single non-scrolling row that shrinks to fit.
 * Tapping a thumbnail opens a full-screen lightbox (arrows + swipe + counter),
 * matching the incoming-job panel preview.
 * When no job photos: show customer profile picture in the placeholder slot. */
export function PhotoStrip({
  photos,
  isLight,
  profilePhotoUrl,
  profileName,
}: {
  photos: { id: string; url: string; name?: string | null }[];
  isLight: boolean;
  /** Customer profile picture fills the image placeholder when no job photos */
  profilePhotoUrl?: string | null;
  profileName?: string | null;
}) {
  const [lightbox, setLightbox] = useState<{
    photos: { id: string; url: string; name?: string | null }[];
    index: number;
  } | null>(null);
  const touchX = useRef<number | null>(null);

  const displayPhotos =
    photos.length > 0
      ? photos
      : profilePhotoUrl?.trim()
        ? [
            {
              id: "customer-profile",
              url: profilePhotoUrl.trim(),
              name: profileName?.trim() || "Customer",
            },
          ]
        : [];

  if (!displayPhotos.length) {
    // Empty visual placeholder (initials) when no photo at all
    return (
      <div className="mt-1 flex items-stretch gap-1.5 overflow-hidden">
        <div
          className={cn(
            "flex h-20 w-20 shrink-0 items-center justify-center rounded-lg text-[18px] font-black",
            isLight ? "bg-black/10 text-slate-700" : "bg-white/12 text-white",
          )}
          aria-label="Customer photo placeholder"
        >
          {avatarInitials(profileName, "CU")}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-1 flex items-stretch gap-1.5 overflow-hidden">
        {displayPhotos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-label={p.name || "View photo"}
            onClick={() => setLightbox({ photos: displayPhotos, index: i })}
            className="min-w-0 flex-1 basis-0 overflow-hidden rounded-lg border-0 p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src={p.url}
              alt={p.name || "Job photo"}
              className="h-20 w-full object-cover"
            />
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90"
          role="dialog"
          aria-modal
          aria-label="Job photo"
          onClick={() => setLightbox(null)}
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            touchX.current = null;
            if (start == null) return;
            const dx = e.changedTouches[0].clientX - start;
            if (Math.abs(dx) < 48) return;
            setLightbox((lb) => {
              if (!lb) return lb;
              const dir = dx < 0 ? 1 : -1;
              return {
                ...lb,
                index: (lb.index + dir + lb.photos.length) % lb.photos.length,
              };
            });
          }}
        >
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setLightbox(null)}
            className={cn(
              "absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full border-0 p-2 text-white",
              !isLight && "bg-white/10",
            )}
          >
            <X className="h-6 w-6" />
          </button>
          {lightbox.photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) =>
                    lb
                      ? {
                          ...lb,
                          index:
                            (lb.index - 1 + lb.photos.length) %
                            lb.photos.length,
                        }
                      : lb,
                  );
                }}
                className="absolute left-2 z-[201] rounded-full border-0 bg-white/10 p-2 text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) =>
                    lb
                      ? { ...lb, index: (lb.index + 1) % lb.photos.length }
                      : lb,
                  );
                }}
                className="absolute right-2 z-[201] rounded-full border-0 bg-white/10 p-2 text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            loading="lazy"
            decoding="async"
            src={lightbox.photos[lightbox.index]?.url}
            alt={lightbox.photos[lightbox.index]?.name || "Job photo"}
            className="max-h-[80%] max-w-[90%] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-[12px] font-semibold text-white/80">
            {lightbox.index + 1} / {lightbox.photos.length}
          </p>
        </div>
      )}
    </>
  );
}
