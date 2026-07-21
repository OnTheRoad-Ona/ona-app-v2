"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-ui";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { FileText, Shield } from "lucide-react";

export default function SettingsLegalPage() {
  const { theme } = useApp();
  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title="Legal" subtitle="Policies & documents" backHref="/settings" />
      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <SettingsSection title="Documents" isLight={isLight}>
          <SettingsRow
            first
            isLight={isLight}
            icon={FileText}
            label="Terms of Service"
            detail="Rules for using Ona"
            href="/settings/legal/terms"
          />
          <SettingsRow
            isLight={isLight}
            icon={Shield}
            label="Privacy Policy"
            detail="How we handle your data"
            href="/settings/legal/privacy"
          />
        </SettingsSection>
        <p
          className={cn(
            "mt-3 px-1 text-[11px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/55"
          )}
        >
          Questions:{" "}
          <a
            href="mailto:witcowavers@gmail.com"
            className="font-bold text-[#FF6B35] no-underline"
          >
            witcowavers@gmail.com
          </a>
        </p>
      </div>
    </div>
  );
}
