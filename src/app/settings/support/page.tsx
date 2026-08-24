"use client";

/**
 * Ona Support simple, effective help for Customers & Repair Pros.
 * FAQ + email contact + short message to care.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  LifeBuoy,
  Mail,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useAppConfig } from "@/components/app-config-provider";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "witcowavers@gmail.com";

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I get help for my car or home?",
    a: "On Home, pick a trade (Mechanic, Plumber, A/C…), set your radius, then request a Live pro nearby. You can also help someone else by entering their address.",
  },
  {
    q: "Why am I asked to verify?",
    a: "Customers: verify phone (Tier 1), then upload ID (Tier 2) after free requests so we can keep the marketplace safe. Repair Pros: complete verification tiers so you can Go Live and appear in search.",
  },
  {
    q: "A request or job is stuck. What do I do?",
    a: "Open Requests or Jobs and check the status. If something looks wrong, message care below with your name, phone, and job details. We’ll help from the backend.",
  },
  {
    q: "How do payments and escrow work?",
    a: "Agreed labour is held in escrow when a job is paid, then released when work is done and confirmed. Spare parts are never mixed into labour prices.",
  },
  {
    q: "I can’t Go Live as a Repair Pro",
    a: "Finish required verification and wait for admin approval on ID / skill docs. Check Dashboard for your tier status, or write to care with your registered email.",
  },
];

export default function SettingsSupportPage() {
  const { theme, displayName, userProfile, accountType } = useApp();
  const { config } = useAppConfig();
  const isLight = theme === "light";
  const email =
    (config.app.supportEmail || SUPPORT_EMAIL).trim() || SUPPORT_EMAIL;

  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [subject, setSubject] = useState("Help with Ona");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const roleLabel = accountType === "professional" ? "Repair Pro" : "Customer";

  const prefilled = useMemo(() => {
    const lines = [
      body.trim(),
      "",
      "",
      `Name: ${userProfile?.fullName || displayName || "Not set"}`,
      `Role: ${roleLabel}`,
      `Phone: ${userProfile?.phone || "Not set"}`,
      `Email: ${userProfile?.email || "Not set"}`,
    ];
    return lines.join("\n");
  }, [body, userProfile, displayName, roleLabel]);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";
  const card = "bg-transparent";
  const field = isLight
    ? "w-full rounded-md border-0 bg-black/[0.06] px-3 py-2.5 text-[13px] font-medium text-slate-900 outline-none placeholder:text-slate-500"
    : "w-full rounded-md border-0 bg-white/[0.08] px-3 py-2.5 text-[13px] font-medium text-white outline-none placeholder:text-white/40";

  const sendToCare = () => {
    setErr(null);
    if (!body.trim() || body.trim().length < 8) {
      setErr("Write a short message (at least a few words).");
      return;
    }
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      subject.trim() || "Help with Ona",
    )}&body=${encodeURIComponent(prefilled)}`;
    try {
      window.location.href = mailto;
      setSent(true);
    } catch {
      setErr(`Could not open email. Write us at ${email}`);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader
        title="Support"
        subtitle="We’re here when you need Ona"
        backHref="/settings"
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-8 scrollbar-hide">
        {/* Intro */}
        <div
          className={cn("flex items-start gap-3 rounded-md px-3 py-3", card)}
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              isLight ? "bg-white/80" : "bg-white/10",
            )}
          >
            <LifeBuoy className="h-5 w-5 text-[#FF6B35]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className={cn("text-[14px] font-bold", ink)}>Ona Care</p>
            <p
              className={cn(
                "mt-0.5 text-[12px] font-medium leading-snug",
                muted,
              )}
            >
              Quick answers below. Still stuck? Email care or send a short
              message. We reply from the Ona team.
            </p>
          </div>
        </div>

        {/* Contact */}
        <section>
          <p
            className={cn(
              "mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.12em]",
              muted,
            )}
          >
            Contact
          </p>
          <a
            href={`mailto:${email}`}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-3 no-underline transition-opacity active:opacity-80",
              card,
            )}
          >
            <Mail className="h-4 w-4 shrink-0 text-[#FF6B35]" />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[13px] font-semibold", ink)}>
                Email care
              </span>
              <span className={cn("block text-[12px] font-medium", muted)}>
                {email}
              </span>
            </span>
          </a>
        </section>

        {/* FAQ */}
        <section>
          <p
            className={cn(
              "mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.12em]",
              muted,
            )}
          >
            Common questions
          </p>
          <ul className={cn("overflow-hidden rounded-md", card)}>
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <li key={item.q} className="">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-3 text-left"
                    aria-expanded={open}
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[13px] font-semibold",
                        ink,
                      )}
                    >
                      {item.q}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        muted,
                        open && "rotate-180",
                      )}
                    />
                  </button>
                  {open ? (
                    <p
                      className={cn(
                        "px-3 pb-3 text-[12px] font-medium leading-relaxed",
                        muted,
                      )}
                    >
                      {item.a}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Message care */}
        <section>
          <p
            className={cn(
              "mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.12em]",
              muted,
            )}
          >
            <MessageSquare className="h-3 w-3" />
            Message care
          </p>
          <div className={cn("space-y-2 rounded-md px-3 py-3", card)}>
            <input
              className={field}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              maxLength={80}
            />
            <textarea
              className={cn(field, "min-h-[100px] resize-none")}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setSent(false);
                setErr(null);
              }}
              placeholder="What do you need help with? Include job or account details if you can."
              maxLength={2000}
            />
            {err ? (
              <p className="text-[11px] font-semibold text-red-500">{err}</p>
            ) : null}
            {sent ? (
              <p className="text-[11px] font-semibold text-emerald-600">
                Opening your email app… If nothing opens, write to {email}
              </p>
            ) : null}
            <button
              type="button"
              onClick={sendToCare}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md border-0 bg-[#323231] text-[13px] font-bold text-white active:opacity-90"
            >
              <Mail className="h-4 w-4" />
              Send to care
            </button>
            <p className={cn("text-center text-[10px] leading-snug", muted)}>
              Sends via your email app to {email}. Your name and role are added
              automatically.
            </p>
          </div>
        </section>

        <p
          className={cn(
            "flex items-center justify-center gap-1.5 px-2 text-center text-[10px]",
            muted,
          )}
        >
          <ShieldCheck className="h-3 w-3 shrink-0 text-[#FF6B35]" />
          Ona Care · we keep jobs and accounts safe
        </p>
      </div>
    </div>
  );
}
