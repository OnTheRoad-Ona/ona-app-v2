"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AUTH_BG } from "@/components/auth/auth-plate";

/** Legacy route → full Repair Pro signup */
export default function ProServiceRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signup/pro");
  }, [router]);
  return (
    <div
      className="h-full w-full"
      style={{ backgroundColor: AUTH_BG }}
      aria-hidden
    />
  );
}
