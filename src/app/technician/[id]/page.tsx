"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProOwnProfile } from "@/components/profile/pro-own-profile";
import { ProPublicView } from "@/components/profile/pro-public-view";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";

/**
 * Motorist opens a Repair Pro from home / map (read-only).
 * Own pro card (`pro-self`) → pro own profile editor.
 * Repair Pros never get a route to view Motorist profiles.
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
  const [loading, setLoading] = useState(!fromStore);
  const [error, setError] = useState<string | null>(null);
  const isLight = theme === "light";
  const isOwnPro =
    id === "pro-self" && accountType === "professional";

  useEffect(() => {
    if (isOwnPro) return;
    if (fromStore) {
      setTech(fromStore);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const lat = location?.coordinates?.lat ?? 6.5244;
    const lng = location?.coordinates?.lng ?? 3.3792;
    const qs = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });

    void (async () => {
      try {
        const res = await fetch(`/api/pros/${encodeURIComponent(id)}?${qs}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!json?.ok || !json.data?.technician) {
          setTech(null);
          setError(json?.error?.message || "Technician not found");
          setLoading(false);
          return;
        }
        setTech(json.data.technician as Technician);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Could not load technician. Check your connection.");
          setLoading(false);
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
  ]);

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
      onRequest={() => {
        setSelectedTechId(tech.id);
        router.push(`/request?tech=${tech.id}`);
      }}
    />
  );
}
