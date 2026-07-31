"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { InAppCallProvider } from "@/components/call/in-app-call";
import { InboundBanner } from "@/components/layout/inbound-banner";
import { PhoneShell } from "@/components/layout/phone-shell";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { NotificationProvider } from "@/components/notifications/notification-provider";
import { NotificationToasts } from "@/components/notifications/notification-toasts";
import { clearPageExitClass, recordNavigation } from "@/lib/navigation";
import { installAudioUnlockOnce } from "@/lib/sound-tone";

/** Phone shell + auth for the consumer app; full-page for /admin backend. */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const isAdmin = pathname.startsWith("/admin");

  // iOS/Safari: unlock Web Audio on first tap so event sounds can play later
  useEffect(() => {
    installAudioUnlockOnce();
  }, []);

  // Accessibility prefs (Settings → Accessibility) survive reloads
  useEffect(() => {
    try {
      const scale = Number(localStorage.getItem("ona-a11y-font-scale") || "100");
      if (scale >= 90 && scale <= 130 && scale !== 100) {
        document.documentElement.style.fontSize = `${scale}%`;
      }
      if (localStorage.getItem("ona-a11y-font-scale-hc") === "1") {
        document.documentElement.dataset.a11yHc = "1";
      }
    } catch {
      /* private mode */
    }
  }, []);

  // Clear exit animation; Back is hierarchical (no history stack)
  useEffect(() => {
    if (isAdmin) return;
    clearPageExitClass();
    recordNavigation(pathname);
  }, [pathname, isAdmin]);

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <PhoneShell>
      <InAppCallProvider>
        <AuthGate>
          <NotificationProvider>
            <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
              <InboundBanner />
              <NotificationToasts />
              {/* No key={pathname}: remounting every route re-fired auth/GPS and felt like a loop */}
              <div className="om-page-enter relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                {children}
              </div>
              <NotificationCenter />
            </div>
          </NotificationProvider>
        </AuthGate>
      </InAppCallProvider>
    </PhoneShell>
  );
}
