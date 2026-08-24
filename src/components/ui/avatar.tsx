"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export function Avatar({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        // Perfect circle clip no default ring/border (callers add if needed)
        "relative flex h-12 w-12 shrink-0 overflow-hidden rounded-full border-0 ring-0",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      className={cn(
        // cover + square gear-fill asset → ring sits edge-to-edge in circle
        "aspect-square h-full w-full object-cover object-center",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600",
        className,
      )}
      {...props}
    />
  );
}
