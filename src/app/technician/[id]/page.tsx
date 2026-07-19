"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProOwnProfile } from "@/components/profile/pro-own-profile";
import { ProPublicView } from "@/components/profile/pro-public-view";
import {
  proCtaKind,
  proCtaLabel,
} from "@/lib/jobs/motorist-pro-cta";
import { useMotoristJobsByPro } from "@/lib/jobs/use-motorist-jobs-by-pro";
import type { ProfileReview } from "@/lib/profile-system";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";

/**
 * Motorist opens a Repair Pro from home / map (read-only).
 * Own pro card (`pro-self`) → pro own profile editor.
 * Live reviews poll so new ratings appear before offering.
 */
export default function TechnicianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    technicians,
    setSelectedTechId,
    theme,
    location,
    accountType,
  } = useApp();
  const fromStore = technicians.find((t) => t.id === id) || null;
  const [tech, setTech] = useState<Technician | null>(fromStore);
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [loading, setLoading] = useState(!fromStore);
  const [error, setError] = useState<string | null>(null);
  const isLight = theme === "light";
  const isOwnPro =
    id === "pro-self" && accountType === "professional";
  const { byPro: jobsByPro } = useMotoristJobsByPro();
  const activeJob = tech ? jobsByPro[tech.id] ?? null : null;
  const cta = proCtaKind(activeJob);

  const applyReviewMeta = useCallback(
    (
      list: ProfileReview[],
      ratingAvg?: number,
      ratingCount?: number
    ) => {
      setReviews(list);
      setTech((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rating:
            typeof ratingAvg === "number" && ratingAvg > 0
              ? ratingAvg
              : prev.rating,
          reviewCount:
            typeof ratingCount === "number"
              ? ratingCount
              : list.length || prev.reviewCount,
        };
      });
    },
    []
  );

  const loadReviews = useCallback(async () => {
    if (!id || id === "pro-self") return;
    try {
      const res = await fetch(`/api/pros/${encodeURIComponent(id)}/reviews`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) return;
      const list = (json.data?.reviews || []) as ProfileReview[];
      applyReviewMeta(
        list,
        Number(json.data?.ratingAvg),
        Number(json.data?.ratingCount)
      );
    } catch {
      /* keep last known */
    }
  }, [id, applyReviewMeta]);

  useEffect(() => {
    if (isOwnPro) return;
    if (fromStore) {
      setTech(fromStore);
      setLoading(false);
      setError(null);
    }

    let cancelled = false;
    setLoading((v) => (fromStore ? false : true));
    setError(null);
    const lat = location?.coordinates?.lat;
    const lng = location?.coordinates?.lng;
    // Prefer live GPS only — no hardcoded Ikeja/mainland fallback
    const qs = new URLSearchParams();
    if (typeof lat === "number" && Number.isFinite(lat)) {
      qs.set("lat", String(lat));
    }
    if (typeof lng === "number" && Number.isFinite(lng)) {
      qs.set("lng", String(lng));
    }

    void (async () => {
      try {
        const res = await fetch(`/api/pros/${encodeURIComponent(id)}?${qs}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!json?.ok || !json.data?.technician) {
          if (!fromStore) {
            setTech(null);
            setError(json?.error?.message || "Technician not found");
          }
          setLoading(false);
          // Still try reviews (pro may be offline but reviews public)
          void loadReviews();
          return;
        }
        const t = json.data.technician as Technician;
        setTech(t);
        const list = (json.data.reviews || []) as ProfileReview[];
        applyReviewMeta(
          list,
          Number(json.data.ratingAvg ?? t.rating),
          Number(json.data.ratingCount ?? t.reviewCount)
        );
        setLoading(false);
      } catch {
        if (!cancelled) {
          if (!fromStore) {
            setError("Could not load technician. Check your connection.");
          }
          setLoading(false);
          void loadReviews();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    id,
    fromStore,
    location?.coordinates?.lat,
    location?.coordinates?.lng,
    isOwnPro,
    applyReviewMeta,
    loadReviews,
  ]);

  // Reviews: load once + when tab becomes visible (no 4s poll — data saver)
  useEffect(() => {
    if (isOwnPro || !id || id === "pro-self") return;
    void loadReviews();
    const onVis = () => {
      if (!document.hidden) void loadReviews();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [id, isOwnPro, loadReviews]);

  if (isOwnPro) {
    return <ProOwnProfile isLight={isLight} />;
  }

  if (loading) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center gap-2 p-6 ${
          isLight ? "bg-[#c8c9cd] text-slate-800" : "bg-black text-white"
        }`}
      >
        <p className="text-sm font-semibold">Loading technician…</p>
      </div>
    );
  }

  if (!tech) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center gap-3 p-6 ${
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        }`}
      >
        <p
          className={
            isLight
              ? "font-semibold text-slate-900"
              : "font-semibold text-white"
          }
        >
          {error || "Technician not found"}
        </p>
        <p
          className={
            isLight
              ? "max-w-xs text-center text-[12px] text-slate-600"
              : "max-w-xs text-center text-[12px] text-white/60"
          }
        >
          This Repair Pro is Away, switched to Motorist, unapproved, or the
          link is outdated. Only Live pros are available.
        </p>
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>
    );
  }

  return (
    <ProPublicView
      tech={tech}
      isLight={isLight}
      reviews={reviews}
      ctaKind={cta}
      ctaLabel={proCtaLabel(cta, true)}
      onRequest={() => {
        if (cta !== "request" && activeJob?.id) {
          router.push(`/jobs/${activeJob.id}`);
          return;
        }
        setSelectedTechId(tech.id);
        router.push(`/request?tech=${tech.id}`);
      }}
    />
  );
}
