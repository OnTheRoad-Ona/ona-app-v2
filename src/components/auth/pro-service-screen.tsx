"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, ChevronLeft, CircleDot, Scissors, Wrench } from "lucide-react";
import { BrandHeroMotion } from "@/components/auth/brand-hero-motion";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRO_SERVICES: {
  id: ProService;
  label: string;
  hint: string;
  icon: typeof Wrench;
}[] = [
  {
    id: "mechanic",
    label: "Mechanic",
    hint: "Engine, brakes and general repair",
    icon: Wrench,
  },
  {
    id: "vulcanizer",
    label: "Vulcanizer",
    hint: "Tyres, tubes and balancing",
    icon: CircleDot,
  },
  {
    id: "towing",
    label: "Tow",
    hint: "Tow and recovery",
    icon: Car,
  },
  {
    id: "fashion",
    label: "Fashion Designer",
    hint: "Fashion design and tailoring",
    icon: Scissors,
  },
];

/**
 * Dedicated page: choose primary Repair Professional service.
 * Reached from login after selecting Repair Pro not an inline menu.
 */
export function ProServiceScreen() {
  const router = useRouter();
  const { login } = useApp();
  const [selected, setSelected] = useState<ProService | null>(null);
  const [busy, setBusy] = useState(false);

  const onContinue = () => {
    if (!selected || busy) return;
    setBusy(true);
    login({
      accountType: "professional",
      proService: selected,
    });
    router.replace("/dashboard");
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <BrandHeroMotion size="full" bottomFade={false} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-6 pt-8">
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="om-apple-motion-delay mb-4 inline-flex w-fit items-center gap-1 rounded-md border-0 bg-black/40 px-2 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <div className="om-apple-motion-delay text-center">
          <p className="text-[11px] font-bold tracking-[0.28em] text-white/80">
            REPAIR PROFESSIONAL
          </p>
          <h1 className="mt-1 text-[22px] font-black tracking-tight text-white drop-shadow-md">
            What service do you offer?
          </h1>
          <p className="mt-1.5 text-[12px] text-white/70">
            Pick your primary trade. You can add more later in Profile.
          </p>
        </div>

        <div className="om-apple-motion-panel mt-auto flex flex-col gap-2.5 rounded-md bg-black/55 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-2">
            {PRO_SERVICES.map(({ id, label, hint, icon: Icon }) => {
              const active = selected === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelected(id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border-0 px-3 py-3 text-left transition-colors",
                    active
                      ? "bg-[#FF6B35] text-white shadow-lg shadow-orange-900/25"
                      : "bg-white/10 text-white hover:bg-white/15",
                  )}
                  aria-pressed={active}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-white/20" : "bg-white/10",
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-tight">
                      {label}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        active ? "text-white/85" : "text-white/55",
                      )}
                    >
                      {hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onContinue}
            disabled={!selected || busy}
            className="metallic-orange mt-1 h-11 w-full rounded-xl text-[14px] font-bold text-white disabled:opacity-45"
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
