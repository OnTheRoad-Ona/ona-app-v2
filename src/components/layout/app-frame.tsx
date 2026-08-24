"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { InAppCallProvider } from "@/components/call/in-app-call";
import { RoleBootstrap } from "@/components/home/role-bootstrap";
import { InboundBanner } from "@/components/layout/inbound-banner";
import { PhoneShell } from "@/components/layout/phone-shell";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { NotificationProvider } from "@/components/notifications/notification-provider";
import { NotificationToasts } from "@/components/notifications/notification-toasts";
import { clearPageExitClass, recordNavigation } from "@/lib/navigation";
import { installAudioUnlockOnce } from "@/lib/sound-tone";
import { useApp } from "@/lib/store";

/** Phone shell + auth for the consumer app; full-page for /admin backend. */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const isAdmin = pathname.startsWith("/admin");
  const { switchingRole, theme } = useApp();
  const isLight = theme === "light";

  // iOS/Safari: unlock Web Audio on first tap so event sounds can play later
  useEffect(() => {
    installAudioUnlockOnce();
  }, []);

  // Accessibility prefs (Settings → Accessibility) survive reloads
  useEffect(() => {
    try {
      const scale = Number(
        localStorage.getItem("ona-a11y-font-scale") || "100",
      );
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
              <RoleBootstrap />
              {!switchingRole ? <InboundBanner /> : null}
              {!switchingRole ? <NotificationToasts /> : null}
              {/* No key={pathname}: remounting every route re-fired auth/GPS and felt like a loop */}
              <div className="om-page-enter relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                {children}
              </div>
              {switchingRole ? (
                <div
                  className="absolute inset-0 z-[220] flex flex-col items-center justify-center gap-3"
                  style={{
                    backgroundColor: isLight ? "#ffffff" : "#1a1210",
                  }}
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
                  <span
                    className="text-[13px] font-bold"
                    style={{
                      color: isLight ? "#334155" : "rgba(255,255,255,0.7)",
                    }}
                  >
                    Switching account…
                  </span>
                </div>
              ) : null}
              <NotificationCenter />
            </div>
          </NotificationProvider>
        </AuthGate>
      </InAppCallProvider>
    </PhoneShell>
  );
}
