"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  authFieldClass,
  authFieldIconClass,
  authFieldStyle,
} from "@/components/auth/auth-plate";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Left icon padding (signup fields with lock icon) */
  withLeftIcon?: boolean;
  /** Extra classes on the input */
  inputClassName?: string;
};

/**
 * Password input with show/hide control on the right end of the field.
 * Use for Log In, Sign Up, and Reset password screens.
 */
export function PasswordField({
  className,
  inputClassName,
  withLeftIcon = false,
  disabled,
  ...rest
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <input
        {...rest}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={cn(
          withLeftIcon ? authFieldIconClass : authFieldClass,
          // Room for the eye toggle on the right
          withLeftIcon ? "pr-11" : "pr-11",
          inputClassName,
        )}
        style={authFieldStyle}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <button
        type="button"
        tabIndex={0}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        className={cn(
          "absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border-0 bg-transparent text-[#64748b] transition hover:bg-black/[0.06] hover:text-[#0f172a] disabled:opacity-40",
        )}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" strokeWidth={2.25} />
        ) : (
          <Eye className="h-4 w-4" strokeWidth={2.25} />
        )}
      </button>
    </div>
  );
}
