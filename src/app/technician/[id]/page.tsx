"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProPublicProfile } from "@/components/technician/pro-public-profile";
import { useApp } from "@/lib/store";

/**
 * Motorist opens a Repair Pro from home / map.
 * Layout mirrors Repair Pro signup sections (skill, focus, about, area).
 */
export default function TechnicianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { technicians, setSelectedTechId, theme } = useApp();
  const tech = technicians.find((t) => t.id === id);
  const isLight = theme === "light";

  if (!tech) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#c8c9cd] p-6">
        <p className="font-semibold text-slate-900">Technician not found</p>
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>
    );
  }

  return (
    <ProPublicProfile
      tech={tech}
      isLight={isLight}
      onRequest={() => {
        setSelectedTechId(tech.id);
        router.push(`/request?tech=${tech.id}`);
      }}
      backHref="/"
    />
  );
}
