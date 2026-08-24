"use client";

/**
 * Ona Express premium intelligent direct booking (Vehicle Services).
 * One flow, no separate service buttons.
 */

import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ExpressFlow } from "@/components/express/express-flow";

export default function ExpressPage() {
  const { theme } = useApp();
  const isLight = theme === "light";
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <ExpressFlow isLight={isLight} />
    </div>
  );
}
