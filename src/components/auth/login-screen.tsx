"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Wrench } from "lucide-react";
import { BrandHeroMotion } from "@/components/auth/brand-hero-motion";
import { useApp } from "@/lib/store";
import type { AccountType, ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRO_SERVICES: { id: ProService; label: string }[] = [
  { id: "mechanic", label: "Mechanic" },
  { id: "vulcanizer", label: "Vulcanizer" },
  { id: "towing", label: "Towing" },
  { id: "wash", label: "Car Wash" },
];

/**
 * Login / sign-up: Motorist or Repair Professional.
 * Brand hero enters with Apple dynamic motion.
 */
export function LoginScreen() {
  const router = useRouter();
  const { login } = useApp();
  const [accountType, setAccountType] = useState<AccountType>("motorist");
  const [proService, setProService] = useState<ProService>("mechanic");
  const [busy, setBusy] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    login({
      accountType,
      proService: accountType === "professional" ? proService : undefined,
    });
    router.replace(
      accountType === "professional" ? "/dashboard" : "/"
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <BrandHeroMotion size="full" bottomFade={false} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-6 pt-[4.5rem]">
        <div className="om-apple-motion-delay flex flex-col items-center text-center">
          <p className="text-[11px] font-bold tracking-[0.28em] text-white/80">
            WELCOME TO
          </p>
          <h1 className="mt-1 text-[28px] font-black tracking-tight drop-shadow-md">
            <span className="text-white">Oga</span>
            <span className="text-black">Mecho</span>
          </h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="om-apple-motion-panel mt-auto flex flex-col gap-3 rounded-md bg-black/55 p-4 shadow-2xl backdrop-blur-xl"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
            I am a…
          </p>

          <div className="grid grid-cols-2 gap-2">
            <RoleCard
              active={accountType === "motorist"}
              icon={Car}
              title="Motorist"
              subtitle="Find help nearby"
              onClick={() => setAccountType("motorist")}
            />
            <RoleCard
              active={accountType === "professional"}
              icon={Wrench}
              title="Repair Pro"
              subtitle="Offer services"
              onClick={() => setAccountType("professional")}
            />
          </div>

          {accountType === "professional" && (
            <div className="flex flex-wrap gap-1.5">
              {PRO_SERVICES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProService(id)}
                  className={cn(
                    "rounded-full border-0 px-2.5 py-1 text-[11px] font-bold transition-colors",
                    proService === id
                      ? "bg-[#e85a12] text-white"
                      : "bg-white/10 text-white/80 hover:bg-white/15"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="metallic-orange h-11 w-full rounded-xl text-[14px] font-bold text-white disabled:opacity-70"
          >
            {busy ? "Signing in…" : "Continue"}
          </button>

          <p className="text-center text-[10px] text-white/45">
            By continuing you agree to OgaMecho terms of service.
          </p>
        </form>
      </div>
    </div>
  );
}

function RoleCard({
  active,
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: typeof Car;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-xl border-0 px-3 py-3 text-left transition-all",
        active
          ? "bg-[#e85a12] text-white shadow-lg shadow-orange-900/30"
          : "bg-white/10 text-white hover:bg-white/15"
      )}
      aria-pressed={active}
    >
      <Icon className="h-5 w-5" strokeWidth={2.2} />
      <span className="text-[13px] font-bold leading-none">{title}</span>
      <span
        className={cn(
          "text-[10px] leading-snug",
          active ? "text-white/85" : "text-white/55"
        )}
      >
        {subtitle}
      </span>
    </button>
  );
}
