"use client";

/**
 * Soft fade + slight slide for guest auth navigations
 * (Welcome ↔ Log In ↔ Role ↔ Sign Up). ~300ms Apple-like.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** Match CSS animation duration */
export const AUTH_TRANSITION_MS = 300;

export function useAuthNavigate() {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  const go = useCallback(
    (path: string, opts?: { replace?: boolean }) => {
      if (exiting) return;
      setExiting(true);
      window.setTimeout(() => {
        if (opts?.replace) router.replace(path);
        else router.push(path);
        // Reset if we stay mounted (rare)
        window.setTimeout(() => setExiting(false), 50);
      }, AUTH_TRANSITION_MS);
    },
    [exiting, router]
  );

  return {
    exiting,
    go,
    /** Apply to the screen root during transition */
    motionClass: cn("om-auth-enter", exiting && "om-auth-exit"),
  };
}

/** Enter animation only (for AuthPlate pages) */
export function AuthMotion({
  children,
  exiting,
  className,
}: {
  children: React.ReactNode;
  exiting?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        "om-auth-enter",
        exiting && "om-auth-exit",
        className
      )}
    >
      {children}
    </div>
  );
}
