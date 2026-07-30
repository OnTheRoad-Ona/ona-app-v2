"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function PasswordInput({
  className,
  placeholder,
  value,
  onChange,
  isLight,
  autoFocus,
}: {
  className?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  isLight?: boolean;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        className={className}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(!show)}
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 border-0 bg-transparent p-1",
          isLight ? "text-slate-500" : "text-white/50"
        )}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
