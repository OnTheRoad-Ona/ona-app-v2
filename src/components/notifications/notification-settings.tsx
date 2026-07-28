"use client";

/**
 * NotificationSettings — production-ready prefs for Settings.
 * Filter types · delivery (Push / SMS / Email) · quiet hours · save + toast.
 *
 * TODO(api): Persist via PATCH /api/notifications/settings when backend is ready.
 * Currently stores to localStorage keyed by user so device prefs survive reloads.
 */

import { useCallback, useEffect, useId, useState } from "react";
import {
  Bell,
  Mail,
  MessageSquare,
  Moon,
  Smartphone,
  Wallet,
  Wrench,
  Settings2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import {
  getQuietHours,
  setQuietHours,
  QUIET_HOURS_ANYTIME,
  type QuietHoursConfig,
} from "@/lib/notifications/quiet-hours";
import { cn } from "@/lib/utils";

/** Icons, on-toggles, and primary buttons — never yellow/copper */
const ACCENT = "#FF6B35";

const STORAGE_KEY = "ona-notification-settings";

export type NotificationCategoryPref = {
  requests: boolean;
  messages: boolean;
  payments: boolean;
  system: boolean;
  /** Marketing / tips — OFF by default (polite) */
  promotional: boolean;
};

export type NotificationDeliveryPref = {
  push: boolean;
  sms: boolean;
  email: boolean;
  /** In-app inbox banners & center */
  inApp: boolean;
};

export type NotificationSettingsState = {
  enabled: boolean;
  categories: NotificationCategoryPref;
  delivery: NotificationDeliveryPref;
  quietHours: QuietHoursConfig;
};

const DEFAULT_SETTINGS: NotificationSettingsState = {
  enabled: true,
  categories: {
    // Transactional ON by default
    requests: true,
    messages: true,
    payments: true,
    system: true,
    // Promotional OFF by default
    promotional: false,
  },
  delivery: {
    push: true,
    sms: false,
    email: true,
    inApp: true,
  },
  quietHours: {
    enabled: true,
    startHour: 22,
    endHour: 7,
  },
};

function readSettings(userKey: string): NotificationSettingsState {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userKey}`);
    if (!raw) {
      const qh = getQuietHours();
      return { ...DEFAULT_SETTINGS, quietHours: qh };
    }
    const p = JSON.parse(raw) as Partial<NotificationSettingsState>;
    return {
      enabled: p.enabled !== false,
      categories: {
        requests: p.categories?.requests !== false,
        messages: p.categories?.messages !== false,
        payments: p.categories?.payments !== false,
        system: p.categories?.system !== false,
        // Promo defaults OFF unless user explicitly enabled
        promotional: p.categories?.promotional === true,
      },
      delivery: {
        push: p.delivery?.push !== false,
        sms: p.delivery?.sms === true,
        email: p.delivery?.email !== false,
        inApp: p.delivery?.inApp !== false,
      },
      quietHours: {
        enabled: p.quietHours?.enabled !== false,
        startHour:
          Number(p.quietHours?.startHour) === QUIET_HOURS_ANYTIME
            ? QUIET_HOURS_ANYTIME
            : Number.isFinite(p.quietHours?.startHour) &&
                Number(p.quietHours?.startHour) >= 0 &&
                Number(p.quietHours?.startHour) <= 23
              ? Number(p.quietHours?.startHour)
              : 22,
        endHour:
          Number(p.quietHours?.endHour) === QUIET_HOURS_ANYTIME
            ? QUIET_HOURS_ANYTIME
            : Number.isFinite(p.quietHours?.endHour) &&
                Number(p.quietHours?.endHour) >= 0 &&
                Number(p.quietHours?.endHour) <= 23
              ? Number(p.quietHours?.endHour)
              : 7,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(userKey: string, s: NotificationSettingsState) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${userKey}`, JSON.stringify(s));
    setQuietHours(s.quietHours);
  } catch {
    /* ignore quota */
  }
}

const CATEGORY_ROWS: {
  key: keyof NotificationCategoryPref;
  label: string;
  detail: string;
  icon: typeof Bell;
}[] = [
  {
    key: "requests",
    label: "Bookings & jobs",
    detail: "Requests, confirmations, reschedules, cancellations",
    icon: Wrench,
  },
  {
    key: "messages",
    label: "Chat",
    detail: "Messages between customers and Repair Pros",
    icon: MessageSquare,
  },
  {
    key: "payments",
    label: "Payments & receipts",
    detail: "Escrow, payouts, refunds, receipts",
    icon: Wallet,
  },
  {
    key: "system",
    label: "Reminders & account",
    detail: "Appointment reminders, verification, Live status",
    icon: Settings2,
  },
  {
    key: "promotional",
    label: "Promotions & tips",
    detail: "Offers, credits, product marketing (default off)",
    icon: Bell,
  },
];

const DELIVERY_ROWS: {
  key: keyof NotificationDeliveryPref;
  label: string;
  detail: string;
  icon: typeof Bell;
}[] = [
  {
    key: "push",
    label: "Push",
    detail: "Device alerts when the app is closed",
    icon: Smartphone,
  },
  {
    key: "inApp",
    label: "In-app",
    detail: "Banners and notification center",
    icon: Bell,
  },
  {
    key: "sms",
    label: "SMS",
    detail: "Text for critical job updates",
    icon: MessageSquare,
  },
  {
    key: "email",
    label: "Email",
    detail: "Summaries and receipts",
    icon: Mail,
  },
];

function hourLabel(h: number): string {
  if (h === QUIET_HOURS_ANYTIME) return "Anytime";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

const HOUR_OPTIONS: number[] = [
  QUIET_HOURS_ANYTIME,
  ...Array.from({ length: 24 }, (_, h) => h),
];


type Props = {
  /** Compact embed under Settings, or full standalone card */
  className?: string;
  /** Called after successful save (local + future API) */
  onSaved?: (state: NotificationSettingsState) => void;
};

export function NotificationSettings({ className, onSaved }: Props) {
  const { theme, backendUserId, displayName } = useApp();
  const isLight = theme === "light";
  const accent = ACCENT;
  const userKey = backendUserId || "guest";
  const formId = useId();

  const [state, setState] = useState<NotificationSettingsState>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setState(readSettings(userKey));
    setDirty(false);
  }, [userKey]);

  const patch = useCallback((partial: Partial<NotificationSettingsState>) => {
    setState((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  }, []);

  const patchCategory = useCallback(
    (key: keyof NotificationCategoryPref, value: boolean) => {
      setState((prev) => ({
        ...prev,
        categories: { ...prev.categories, [key]: value },
      }));
      setDirty(true);
    },
    []
  );

  const patchDelivery = useCallback(
    (key: keyof NotificationDeliveryPref, value: boolean) => {
      setState((prev) => ({
        ...prev,
        delivery: { ...prev.delivery, [key]: value },
      }));
      setDirty(true);
    },
    []
  );

  const patchQuiet = useCallback((partial: Partial<QuietHoursConfig>) => {
    setState((prev) => ({
      ...prev,
      quietHours: { ...prev.quietHours, ...partial },
    }));
    setDirty(true);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      writeSettings(userKey, state);

      // TODO(api): await fetch("/api/notifications/settings", {
      //   method: "PATCH",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ userId: backendUserId, ...state }),
      // });

      setDirty(false);
      onSaved?.(state);
      showToast("Notification preferences saved");
    } catch {
      showToast("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";
  const card = isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]";
  // Light OFF track must be clearly darker so the white knob is visible
  const trackOff = isLight ? "#6b6e76" : "rgba(255,255,255,0.28)";
  const knobOn = "#ffffff";
  const knobOff = isLight ? "#f4f4f5" : "#ffffff";

  const Toggle = ({
    on,
    onChange,
    label,
    describedBy,
  }: {
    on: boolean;
    onChange: (v: boolean) => void;
    label: string;
    describedBy?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!on)}
      className="relative h-7 w-12 shrink-0 rounded-full border-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        backgroundColor: on ? accent : trackOff,
        outlineColor: accent,
        boxShadow: "none",
      }}
    >
      <span
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full transition-transform",
          on ? "left-[1.35rem]" : "left-0.5"
        )}
        style={{
          backgroundColor: on ? knobOn : knobOff,
          boxShadow: "none",
        }}
        aria-hidden
      />
    </button>
  );

  const sectionLabel = (text: string) => (
    <p
      className={cn(
        "px-1 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide",
        muted
      )}
      id={`${formId}-${text.replace(/\s+/g, "-").toLowerCase()}`}
    >
      {text}
    </p>
  );

  return (
    <section
      className={cn("relative", className)}
      aria-labelledby={`${formId}-title`}
    >
      <div className={cn("overflow-hidden rounded-md", card)}>
        <div className="flex items-start gap-2 px-3 pt-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: "rgba(255, 107, 53, 0.15)" }}
            aria-hidden
          >
            <Bell className="h-4 w-4" style={{ color: ACCENT }} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id={`${formId}-title`}
              className={cn("text-[14px] font-bold", ink)}
            >
              Notification preferences
            </h3>
            <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
              {displayName
                ? `Alerts for ${displayName}`
                : "Choose what reaches you and how"}
            </p>
          </div>
          <Toggle
            on={state.enabled}
            onChange={(v) => patch({ enabled: v })}
            label="All notifications"
          />
        </div>

        <div
          className={cn(
            "px-3 pb-3 transition-opacity",
            !state.enabled && "pointer-events-none opacity-45"
          )}
          aria-disabled={!state.enabled}
        >
          {sectionLabel("Types")}
          <ul className="space-y-0" role="list">
            {CATEGORY_ROWS.map((row) => {
              const Icon = row.icon;
              const id = `${formId}-cat-${row.key}`;
              return (
                <li
                  key={row.key}
                  className="flex items-center gap-2 py-2.5"
                >
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: accent }}
                    strokeWidth={2.1}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p id={id} className={cn("text-[13px] font-semibold", ink)}>
                      {row.label}
                    </p>
                    <p className={cn("text-[10px] font-medium", muted)}>
                      {row.detail}
                    </p>
                  </div>
                  <Toggle
                    on={state.categories[row.key]}
                    onChange={(v) => patchCategory(row.key, v)}
                    label={row.label}
                    describedBy={id}
                  />
                </li>
              );
            })}
          </ul>

          {sectionLabel("Delivery")}
          <ul className="space-y-0" role="list">
            {DELIVERY_ROWS.map((row) => {
              const Icon = row.icon;
              const id = `${formId}-del-${row.key}`;
              return (
                <li
                  key={row.key}
                  className="flex items-center gap-2 py-2.5"
                >
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: accent }}
                    strokeWidth={2.1}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p id={id} className={cn("text-[13px] font-semibold", ink)}>
                      {row.label}
                    </p>
                    <p className={cn("text-[10px] font-medium", muted)}>
                      {row.detail}
                    </p>
                  </div>
                  <Toggle
                    on={state.delivery[row.key]}
                    onChange={(v) => patchDelivery(row.key, v)}
                    label={`${row.label} delivery`}
                    describedBy={id}
                  />
                </li>
              );
            })}
          </ul>

          {sectionLabel("Quiet hours")}
          <div className="flex items-center gap-2 py-2.5">
            <Moon
              className="h-4 w-4 shrink-0"
              style={{ color: accent }}
              strokeWidth={2.1}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px] font-semibold", ink)}>
                Mute non-urgent
              </p>
              <p className={cn("text-[10px] font-medium", muted)}>
                Critical alerts still break through
              </p>
            </div>
            <Toggle
              on={state.quietHours.enabled}
              onChange={(v) => patchQuiet({ enabled: v })}
              label="Quiet hours"
            />
          </div>

          {state.quietHours.enabled ? (
            <div className="grid grid-cols-2 gap-2 pb-1">
              <label className="block">
                <span className={cn("mb-1 block text-[10px] font-bold uppercase", muted)}>
                  From
                </span>
                <select
                  value={state.quietHours.startHour}
                  onChange={(e) =>
                    patchQuiet({ startHour: Number(e.target.value) })
                  }
                  className={cn(
                    "h-9 w-full rounded-md border-0 px-2 text-[12px] font-semibold outline-none",
                    isLight ? "bg-[#bebfc4] text-slate-900" : "bg-white/10 text-white"
                  )}
                  aria-label="Quiet hours start"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={`from-${h}`} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={cn("mb-1 block text-[10px] font-bold uppercase", muted)}>
                  Until
                </span>
                <select
                  value={state.quietHours.endHour}
                  onChange={(e) =>
                    patchQuiet({ endHour: Number(e.target.value) })
                  }
                  className={cn(
                    "h-9 w-full rounded-md border-0 px-2 text-[12px] font-semibold outline-none",
                    isLight ? "bg-[#bebfc4] text-slate-900" : "bg-white/10 text-white"
                  )}
                  aria-label="Quiet hours end"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={`until-${h}`} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              className={cn(
                "h-10 flex-1 rounded-md border-0 text-[13px] font-bold text-white transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-45"
              )}
              style={{
                backgroundColor: accent,
                outlineColor: accent,
              }}
              aria-busy={saving}
            >
              {saving ? "Saving…" : dirty ? "Save preferences" : "Saved"}
            </button>
          </div>
          <p className={cn("mt-2 text-[10px] font-medium leading-snug", muted)}>
            Saved on this device. Server sync coming soon.
          </p>
        </div>
      </div>

      {toast ? (
        <div
          className="pointer-events-none absolute inset-x-3 -bottom-2 z-10 flex justify-center"
          role="status"
          aria-live="polite"
        >
          <div
            className="rounded-md border-0 px-3 py-2 text-center text-[12px] font-semibold"
            style={{
              backgroundColor: isLight ? "#c8c9cd" : "#000000",
              color: isLight ? "#1a1b1e" : "#f5f5f5",
            }}
          >
            {toast}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default NotificationSettings;
