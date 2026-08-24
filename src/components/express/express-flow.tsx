"use client";

/**
 * Ona Express premium intelligent direct booking (Vehicle Services).
 * Vehicle → smart cascading questions → booking type → location →
 * price summary + upfront payment → "Trade Assigned" → negotiate extras.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Lock, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  formatVehicleLabel,
  profileVehiclesOf,
} from "@/components/home/job-vehicle-step";
import { VehicleCascadeFields } from "@/components/vehicles/vehicle-cascade-fields";
import { AddressAutocomplete } from "@/components/map/address-autocomplete";
import type { PickedLocation } from "@/components/map/location-picker-map";
import type { MotoristVehicle } from "@/lib/types";
import {
  detectExpressTrade,
  getExpressScreen,
  nextExpressStep,
} from "@/lib/express/question-engine";
import { expressAssignedTitle, isExpressTrade } from "@/lib/express/pricing";
import { useApp } from "@/lib/store";
import { useExactCountdown } from "@/lib/jobs/use-exact-countdown";
import { cn } from "@/lib/utils";

type Stage =
  | "blocked"
  | "categories"
  | "vehicle"
  | "questions"
  | "detected"
  | "booking"
  | "location"
  | "urgency"
  | "pay"
  | "paying"
  | "assigned";

type ResumePayload = {
  requestId: string;
  trade: string;
  lat: number;
  lng: number;
  label: string;
};

type Quote = {
  trade: string;
  baseMajor: number;
  baseChargeMajor: number;
  distanceKm: number | null;
  distanceChargeMajor: number;
  calloutMajor: number;
  urgency: string;
  urgencyMultiplier: number;
  urgencySurchargeMajor: number;
  totalMajor: number;
};

const SCHEDULE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

const TRADE_LABEL: Record<string, string> = {
  mechanic: "Mechanic",
  vulcanizer: "Vulcanizer",
  towing: "Tow expert",
  battery: "Battery expert",
  ac: "A/C expert",
  body: "Body expert",
  electrical: "Auto electrician",
  diagnostics: "Scan expert",
};

const URGENCY_OPTIONS = [
  { id: "normal", label: "Normal", mult: "1" },
  { id: "emergency", label: "Urgent", mult: "1.25" },
  { id: "remote", label: "Remote", mult: "1.35" },
  { id: "night", label: "Night", mult: "1.5" },
] as const;

const URGENCY_LABEL: Record<string, string> = {
  normal: "Normal",
  emergency: "Urgent",
  remote: "Remote",
  night: "Night",
};

function naira(major: number): string {
  return `₦${Math.round(major).toLocaleString("en-NG")}`;
}

export function ExpressFlow({ isLight }: { isLight: boolean }) {
  const router = useRouter();
  const { userProfile, backendUserId, isAuthenticated, location } = useApp();

  const [stage, setStage] = useState<Stage>("categories");
  const [screenId, setScreenId] = useState("main");
  const [screenStack, setScreenStack] = useState<string[]>(["main"]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [manualVehicles, setManualVehicles] = useState<MotoristVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [draftVehicleType, setDraftVehicleType] = useState("");
  const [draftMake, setDraftMake] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [draftYear, setDraftYear] = useState("");
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [garageVehicles, setGarageVehicles] = useState<MotoristVehicle[]>([]);
  /** Continue only shows right after saving a new vehicle (select auto-proceeds). */
  const [pendingContinue, setPendingContinue] = useState(false);
  const [urgency, setUrgency] = useState<string>("normal");
  const [detectedTrade, setDetectedTrade] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [bankPay, setBankPay] = useState<{
    accountName: string;
    accountNumber: string;
    bankName: string;
    amountMajor: number;
    reference: string;
    sessionEndsAt: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [bookingType, setBookingType] = useState<"instant" | "scheduled">(
    "instant",
  );
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [pickedLoc, setPickedLoc] = useState<PickedLocation | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [assignedPro, setAssignedPro] = useState<{
    name: string;
    trade: string;
    requestId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verifyTriesRef = useRef(0);

  const savedVehicles = useMemo(() => {
    const profile = profileVehiclesOf(userProfile);
    const all = [...profile, ...manualVehicles, ...garageVehicles];
    const seen = new Set<string>();
    const out: MotoristVehicle[] = [];
    for (const v of all) {
      const label = formatVehicleLabel(v);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(v);
    }
    return out;
  }, [userProfile, manualVehicles, garageVehicles]);

  /** Garage vehicles (user_vehicles) saved from Shop, invisible to profile. */
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/shop/vehicles");
        if (!res.ok) return;
        const json = await res.json();
        const list = json?.data?.vehicles;
        if (!cancelled && Array.isArray(list)) {
          setGarageVehicles(
            list
              .map(
                (g: {
                  id: string;
                  makeName?: string;
                  modelName?: string;
                  year?: number | null;
                  vehicleTypeSlug?: string;
                }) => ({
                  id: `gar-${g.id}`,
                  vehicleType: g.vehicleTypeSlug || undefined,
                  make: g.makeName || "",
                  model: g.modelName || "",
                  year: g.year ? String(g.year) : undefined,
                }),
              )
              .filter((v: MotoristVehicle) => v.make && v.model),
          );
        }
      } catch {
        /* garage is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const screen = getExpressScreen(screenId);
  const detected = isExpressTrade(quote?.trade ?? "") ? quote!.trade : null;

  /** Jump straight into the payment step of an existing Express draft. */
  async function resumeExpressPayment(r: ResumePayload) {
    setRequestId(r.requestId);
    setPickedLoc({
      lat: r.lat,
      lng: r.lng,
      label: r.label,
      city: "",
      area: "",
    });
    try {
      const res = await fetch("/api/express/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade: r.trade, lat: r.lat, lng: r.lng }),
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        setQuote(json.data as Quote);
        setStage("pay");
      } else {
        setError("Could not resume this booking. Try again.");
      }
    } catch {
      setError("Could not resume this booking. Try again.");
    }
  };

  /** Return from payment gateway (?paid=1&ref=…) → verify → assignment. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ref") && params.get("request")) {
      setStage("paying");
      return;
    }
    // "Finish payment" resume (explicit card tap).
    if (params.get("resume")) {
      try {
        const raw = window.sessionStorage.getItem("ona-express-resume");
        if (raw) {
          window.sessionStorage.removeItem("ona-express-resume");
          const r = JSON.parse(raw) as ResumePayload;
          if (r?.requestId) {
            void resumeExpressPayment(r);
            return;
          }
        }
      } catch {
        /* fall through to gate */
      }
    }
    // App-wide one-open-request rule: jump into the live request or block.
    void (async () => {
      try {
        const res = await fetch("/api/requests/open-state");
        if (!res.ok) return;
        const json = await res.json();
        const d = json?.data;
        if (!d) return;
        if (d.expressPending) {
          void resumeExpressPayment({
            requestId: d.expressPending.requestId,
            trade: d.expressPending.trade,
            lat: Number(d.expressPending.lat),
            lng: Number(d.expressPending.lng),
            label: String(d.expressPending.locationLabel || "Near you"),
          });
          return;
        }
        if (d.hasOpen) setStage("blocked");
      } catch {
        /* offline: allow normal entry */
      }
    })();
  }, []);


  useEffect(() => {
    if (stage !== "paying") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    const requestId = params.get("request");
    const tradeParam = params.get("trade");
    if (!ref || !requestId) return;
    if (verifyTriesRef.current >= 4) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/express/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref }),
        });
        const json = await res.json();
        if (!res.ok || !json?.data?.success) throw new Error("not paid yet");
        if (!cancelled) {
          setAssignedPro({
            name: json.data.assignedProName ?? "",
            trade:
              (tradeParam && isExpressTrade(tradeParam) ? tradeParam : null) ??
              "mechanic",
            requestId,
          });
          setStage("assigned");
        }
      } catch {
        verifyTriesRef.current += 1;
        window.setTimeout(() => {
          if (!cancelled) setStage((s) => (s === "paying" ? "paying" : s));
        }, 2500);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage]);

  const pickOption = (optionId: string, label: string) => {
    const nextAnswers = {
      ...answers,
      [screenId]: optionId,
      [`${screenId}_label`]: label,
    };
    setAnswers(nextAnswers);
    setError(null);
    const next = nextExpressStep(screenId, optionId, nextAnswers);
    if (next === "detect") {
      setDetectedTrade(detectExpressTrade(nextAnswers));
      setStage("detected");
    } else {
      setScreenId(next);
      setScreenStack((prev) => [...prev, next]);
    }
  };

  const submitText = () => {
    if (!draft.trim()) return;
    const nextAnswers = {
      ...answers,
      [screenId]: draft.trim(),
      [`${screenId}_label`]: draft.trim(),
    };
    setAnswers(nextAnswers);
    setDraft("");
    setDetectedTrade(detectExpressTrade(nextAnswers));
    setStage("detected");
  };

  const scheduleIso = useMemo(() => {
    if (bookingType !== "scheduled" || !schedDate || !schedTime) return null;
    return new Date(`${schedDate}T${schedTime}:00`).toISOString();
  }, [bookingType, schedDate, schedTime]);

  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    setNowTs(Date.now());
  }, []);

  const scheduleValid = useMemo(() => {
    if (!scheduleIso) return false;
    const t = Date.parse(scheduleIso);
    if (!Number.isFinite(t)) return false;
    if (!nowTs) return false;
    return t >= nowTs - 60_000 && t - nowTs <= SCHEDULE_MAX_MS;
  }, [scheduleIso, nowTs]);

  const goLocation = () => {
    setError(null);
    setStage("location");
  };

  const confirmLocation = async () => {
    setError(null);
    const coords = pickedLoc ?? {
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
    };
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
      setError("Confirm your location first.");
      return;
    }
    const trade = detectExpressTrade(answers);
    setBusy(true);
    try {
      const res = await fetch("/api/express/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade, lat: coords.lat, lng: coords.lng }),
      });
      const json = await res.json();
      if (!res.ok || !json?.data) throw new Error(json?.error?.message);
      setQuote(json.data as Quote);
      setStage("urgency");
    } catch {
      setError("Could not price this booking. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const pickUrgency = async (kind: string) => {
    if (!quote) return;
    setError(null);
    const coords = pickedLoc ?? {
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
    };
    try {
      const res = await fetch("/api/express/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade: quote.trade,
          lat: coords.lat,
          lng: coords.lng,
          urgency: kind,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.data) throw new Error(json?.error?.message);
      setUrgency(kind);
      setQuote(json.data as Quote);
      setStage("pay");
    } catch {
      setError("Could not apply urgency. Try again.");
    }
  };

  /** Entering the pay stage: create booking, open VA, start polling. */
  const beginPay = async () => {
    if (!isAuthenticated || !backendUserId) {
      router.push("/login/role");
      return;
    }
    if (!quote) return;
    setError(null);
    setBusy(true);
    try {
      const coords = pickedLoc ?? {
        lat: location.coordinates.lat,
        lng: location.coordinates.lng,
      };
      const email =
        userProfile?.email ||
        `express_${backendUserId.slice(0, 8)}@ona.africa`;

      // 1) Create the express booking (idempotent per pay attempt)
      let reqId = requestId;
      if (!reqId) {
        const res = await fetch("/api/express/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trade: quote.trade,
            answers,
            vehicleLabel: vehicleLabel || null,
            lat: coords.lat,
            lng: coords.lng,
            locationLabel: pickedLoc?.label || location.label || "Near you",
            bookingType,
            urgency,
            scheduledAt: bookingType === "scheduled" ? scheduleIso : null,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.data?.requestId) {
          throw new Error(json?.error?.message || "Could not create booking");
        }
        reqId = json.data.requestId as string;
        setRequestId(reqId);
      }

      // 2) Open the Flutterwave VA on the same rails as job checkout
      const initRes = await fetch("/api/express/pay/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: reqId,
          urgency,
          email,
          customerName: userProfile?.fullName || null,
        }),
      });
      const initJson = await initRes.json();
      if (!initRes.ok || !initJson?.data?.bankTransfer) {
        throw new Error(initJson?.error?.message || "Could not open payment");
      }
      const bt = initJson.data.bankTransfer;
      setBankPay({
        accountName: bt.accountName ?? "Ona",
        accountNumber: bt.accountNumber ?? "",
        bankName: bt.bankName ?? "",
        amountMajor: initJson.data.amountMajor ?? quote.totalMajor,
        reference: initJson.data.reference,
        sessionEndsAt: initJson.data.sessionEndsAt,
      });
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment.");
      setBusy(false);
    }
  };

  useEffect(() => {
    if (stage === "pay" && quote && !bankPay && !busy) {
      void beginPay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  /** Poll verify while bank details are on screen; success → assignment. */
  useEffect(() => {
    if (stage !== "pay" || !bankPay) return;
    let stopped = false;
    const tick = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/express/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: bankPay.reference }),
          });
          const json = await res.json();
          if (!stopped && res.ok && json?.data?.expired) {
            // 20-min window elapsed: drop the dead VA and open a fresh one.
            stopped = true;
            window.clearInterval(tick);
            setBankPay(null);
            return;
          }
          if (!stopped && res.ok && json?.data?.success) {
            stopped = true;
            window.clearInterval(tick);
            setAssignedPro({
              name: json.data.assignedProName ?? "",
              trade:
                json.data.trade &&
                isExpressTrade(json.data.trade)
                  ? json.data.trade
                  : (detectedTrade ?? "mechanic"),
              requestId: requestId ?? "",
            });
            setStage("assigned");
          }
        } catch {
          /* keep polling */
        }
      })();
    }, 3000);
    return () => {
      stopped = true;
      window.clearInterval(tick);
    };
  }, [stage, bankPay, requestId, detectedTrade]);

  /** Cancel payment only, or payment together with the draft request. */
  const cancelPay = async (mode: "payment" | "both") => {
    if (!requestId) return;
    setCancelBusy(true);
    setError(null);
    try {
      await fetch("/api/requests/open-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, mode }),
      });
      router.back();
    } catch {
      setError("Could not cancel. Try again.");
      setCancelBusy(false);
    }
  };

  /** Header + bottom Back: step backwards through the flow, never jump pages. */
  const goBack = () => {
    setError(null);
    switch (stage) {
      case "categories":
        router.back();
        break;
      case "vehicle":
        setStage("categories");
        break;
      case "questions": {
        if (screenStack.length > 1) {
          const leaving = screenId;
          const prevId = screenStack[screenStack.length - 2];
          const nextAnswers = { ...answers };
          delete nextAnswers[leaving];
          delete nextAnswers[`${leaving}_label`];
          setAnswers(nextAnswers);
          setScreenStack((prev) => prev.slice(0, -1));
          setScreenId(prevId);
        } else {
          setStage("vehicle");
        }
        break;
      }
      case "booking":
        setStage("detected");
        break;
      case "detected":
        setStage("questions");
        break;
      case "location":
        setStage("booking");
        break;
      case "urgency":
        setStage("location");
        break;
      case "pay":
        setStage("urgency");
        break;
      default:
        /* paying / assigned: back is locked while confirming or done */
        break;
    }
  };

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/50";
  const rowCard = isLight ? "bg-black/[0.02]" : "bg-white/[0.02]";
  const field = isLight
    ? "bg-transparent text-slate-900 placeholder:text-slate-400"
    : "bg-transparent text-white placeholder:text-white/40";

  const title =
    stage === "categories"
      ? "Ona Express"
      : stage === "booking"
        ? "How do you want it done?"
        : stage === "location"
          ? "Where should the professional come to?"
          : stage === "pay"
            ? "Confirm & pay upfront"
            : stage === "paying"
              ? "Confirming your payment…"
              : stage === "assigned" && detected
                ? expressAssignedTitle(detected)
                : "OgaMecho";

  return (
    <>
      <PageHeader title={title} backHref={undefined} onBack={goBack} />
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-24">
        {stage === "blocked" ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className={cn("text-[15px] font-extrabold", ink)}>
              You have an open request
            </p>
            <p className={cn("max-w-[270px] text-[13px] font-medium", muted)}>
              Complete, cancel, or let it expire before starting another one.
            </p>
            <button
              type="button"
              onClick={goBack}
              className="mt-2 h-11 w-full max-w-[280px] rounded-md border-0 bg-brand text-[14px] font-bold text-white"
            >
              Go back
            </button>
          </div>
        ) : null}

        {stage === "categories" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2">
            {/* 1 · OgaMecho the only active group */}
            <button
              type="button"
              onClick={() => {
                setStage("vehicle");
                setError(null);
              }}
              className={cn(
                "w-full rounded-[4px] border-0 px-3 py-3.5 text-left transition-transform active:scale-[0.985]",
                rowCard,
              )}
            >
              <span className={cn("block text-[15px] font-extrabold", ink)}>
                OgaMecho
              </span>
              <span
                className={cn("mt-0.5 block text-[11px] font-medium", muted)}
              >
                Mechanic · Vulcanizer · Tow · Battery · A/C · Body · Electric ·
                Scan
              </span>
            </button>

            {/* Coming-soon groups dimmed, not tappable */}
            {(
              [
                ["Home & Building", "Furniture · Plumber · Painter"],
                ["Power", "Solar · Generator"],
                ["Personal", "Fashion"],
              ] as const
            ).map(([name, subs]) => (
              <div
                key={name}
                aria-disabled
                className={cn(
                  "w-full cursor-not-allowed rounded-[4px] px-3 py-3.5 opacity-40",
                  rowCard,
                )}
              >
                <span className={cn("block text-[13px] font-bold", ink)}>
                  {name}
                </span>
                <span
                  className={cn("mt-0.5 block text-[11px] font-medium", muted)}
                >
                  {subs}
                </span>
              </div>
            ))}
          </div>
        ) : stage === "vehicle" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2">
            {savedVehicles.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {savedVehicles.map((v) => {
                  const label = formatVehicleLabel(v);
                  const selected = selectedVehicleId === (v.id ?? label);
                  return (
                    <li key={v.id ?? label}>
                      <button
                        type="button"
                        onClick={() => {
                          setVehicleLabel(label);
                          setError(null);
                          // Auto-proceed on select no Continue tap needed.
                          setStage("questions");
                          setAnswers({});
                          setScreenId("main");
                          setScreenStack(["main"]);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-[4px] border-0 px-2.5 py-3 text-left transition-transform active:scale-[0.985]",
                          selected ? "bg-[#FF6B35]/10" : rowCard,
                        )}
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 text-[13px] font-semibold",
                            selected ? "text-[#FF6B35]" : ink,
                          )}
                        >
                          {label}
                        </span>
                        {selected ? (
                          <ChevronRight className="h-4 w-4 shrink-0 text-[#FF6B35]" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {/* "+ Add vehicle" reveals the cascade form inline (registration style) */}
            {showVehicleForm ? (
              <div className={cn("rounded-[4px] px-3 py-3", rowCard)}>
                <VehicleCascadeFields
                  make={draftMake}
                  model={draftModel}
                  year={draftYear}
                  onMakeChange={(v) => {
                    setDraftMake(v);
                    setSelectedVehicleId(null);
                  }}
                  onModelChange={(v) => {
                    setDraftModel(v);
                    setSelectedVehicleId(null);
                  }}
                  onYearChange={setDraftYear}
                  vehicleType={draftVehicleType}
                  onVehicleTypeChange={(v) => {
                    setDraftVehicleType(v);
                    setSelectedVehicleId(null);
                  }}
                  variant="profile"
                  isLight={isLight}
                />
              </div>
            ) : null}

            {/* Vehicle-form actions pinned to the bottom */}
            {showVehicleForm ? (
              <div className="absolute inset-x-3 bottom-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowVehicleForm(false);
                      setDraftVehicleType("");
                      setDraftMake("");
                      setDraftModel("");
                      setDraftYear("");
                      setError(null);
                    }}
                    className={cn(
                      "h-10 flex-1 rounded-md border-0 text-[12px] font-semibold",
                      actionFlat(isLight),
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!draftMake.trim() || !draftModel.trim()}
                    onClick={() => {
                      const v: MotoristVehicle = {
                        id: `veh-${Date.now()}-${Math.random()
                          .toString(36)
                          .slice(2, 7)}`,
                        vehicleType: draftVehicleType.trim() || undefined,
                        make: draftMake.trim(),
                        model: draftModel.trim(),
                        year: draftYear.trim() || undefined,
                      };
                      setManualVehicles((prev) => [...prev, v]);
                      setSelectedVehicleId(v.id!);
                      setVehicleLabel(formatVehicleLabel(v));
                      setDraftVehicleType("");
                      setDraftMake("");
                      setDraftModel("");
                      setDraftYear("");
                      setShowVehicleForm(false);
                      setPendingContinue(true);
                      setError(null);
                    }}
                    className="h-10 flex-1 rounded-md border-0 bg-brand text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    Save vehicle
                  </button>
                </div>
              </div>
            ) : null}
            {showVehicleForm ? null : (
              <div className="absolute inset-x-3 bottom-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowVehicleForm(true);
                    setError(null);
                  }}
                  className={cn(
                    "flex w-full items-center justify-center gap-1 rounded-[4px] border-0 px-3 py-3.5 text-left transition-transform active:scale-[0.985]",
                    rowCard,
                  )}
                >
                  <span className={cn("text-[13px] font-bold", ink)}>
                    + Add vehicle
                  </span>
                </button>
              </div>
            )}

            {pendingContinue ? (
              <div className="absolute inset-x-3 bottom-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingContinue(false);
                    setStage("questions");
                    setAnswers({});
                    setScreenId("main");
                    setScreenStack(["main"]);
                  }}
                  className="h-11 w-full rounded-md border-0 bg-brand text-[14px] font-bold text-white"
                >
                  Continue
                </button>
                {error ? (
                  <p className="mt-1 text-center text-[12px] font-semibold text-red-500">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : stage === "assigned" ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full",
                isLight ? "bg-[#FF6B35]/10" : "bg-[#FF6B35]/15",
              )}
            >
              <Zap className="h-8 w-8 text-[#FF6B35]" />
            </div>
            <p className={cn("text-[18px] font-extrabold leading-snug", ink)}>
              {detected
                ? expressAssignedTitle(detected)
                : "Professional Assigned"}
            </p>
            <p className={cn("max-w-[260px] text-[13px] font-medium", muted)}>
              Your {detected ?? "professional"} has been locked in from
              Ona&apos;s pool no waiting for accept/reject. Any extra parts
              needed will be quoted to you after diagnosis.
            </p>
            {assignedPro?.name ? (
              <p className={cn("text-[13px] font-bold", ink)}>
                Assigned: {assignedPro.name}
              </p>
            ) : (
              <p
                className={cn(
                  "flex items-center gap-2 text-[13px] font-medium",
                  muted,
                )}
              >
                <Loader2 className="h-4 w-4 animate-spin" /> Assigning the
                nearest professional…
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                assignedPro && router.push(`/jobs/${assignedPro.requestId}`)
              }
              disabled={!assignedPro}
              className="mt-2 h-11 w-full max-w-[280px] rounded-md border-0 bg-brand text-[14px] font-bold text-white disabled:opacity-50"
            >
              Open Negotiation Desk
            </button>
          </div>
        ) : stage === "paying" ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#FF6B35]" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
            {stage === "questions" && screen ? (
              <>
                {/* Same Q&A pattern as the homepage mechanic flow */}
                <p
                  className={cn(
                    "mt-2 px-0.5 pb-2 text-[14px] font-bold capitalize leading-snug",
                    ink,
                  )}
                >
                  {screen.question}
                </p>
                {screen.kind === "choice" ? (
                  <div className="flex flex-col gap-1">
                    {(screen.options || []).map((opt, i) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => pickOption(opt.id, opt.label)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-[4px] border-0 px-1 py-3 text-left transition-transform duration-150 active:scale-[0.985]",
                          rowCard,
                        )}
                      >
                        <span
                          className={cn(
                            "w-5 shrink-0 text-[12px] font-bold",
                            muted,
                          )}
                        >
                          {i + 1}.
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 text-[13px] font-semibold capitalize leading-snug",
                            ink,
                          )}
                        >
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        setError(null);
                      }}
                      rows={3}
                      placeholder={screen.placeholder}
                      className={cn(
                        "w-full resize-none rounded-xl border-0 px-3 py-2 text-[13px] font-medium leading-snug outline-none",
                        field,
                      )}
                    />
                  </div>
                )}
              </>
            ) : null}

            {stage === "detected" && detectedTrade ? (
              <>
                <div>
                  <div
                    className={cn(
                      "mt-2 rounded-[4px] px-4 py-5 text-center",
                      rowCard,
                    )}
                  >
                    <span
                      className={cn("block text-[15px] font-extrabold", ink)}
                    >
                      We&apos;ve got it.
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-[17px] font-extrabold",
                        isLight ? "text-black" : "text-[#FF6B35]",
                      )}
                    >
                      {TRADE_LABEL[detectedTrade] ?? detectedTrade} will be
                      assigned to you.
                    </span>
                  </div>
                </div>
                <div className="absolute inset-x-3 bottom-2">
                  <button
                    type="button"
                    onClick={() => setStage("booking")}
                    className="h-11 w-full rounded-md border-0 bg-brand text-[14px] font-bold text-white"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={goBack}
                    className={cn(
                      "mt-1 h-9 w-full border-0 bg-transparent text-[12px] font-semibold underline-offset-2 hover:underline",
                      muted,
                    )}
                  >
                  Not correct? Go back and adjust your answers
                </button>
              </div>
            </>
            ) : null}

            {stage === "booking" ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBookingType("instant");
                    goLocation();
                  }}
                  className={cn(
                    "w-full rounded-[4px] px-3 py-4 text-left transition-transform active:scale-[0.985]",
                    rowCard,
                  )}
                >
                  <span className={cn("block text-[14px] font-bold", ink)}>
                    Instant (on-demand)
                  </span>
                  <span className={cn("mt-0.5 block text-[12px]", muted)}>
                    A professional is dispatched as soon as you pay.
                  </span>
                </button>
                <div
                  className={cn(
                    "rounded-[4px] px-3 py-4 transition-transform",
                    rowCard,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setBookingType("scheduled")}
                    className="w-full border-0 bg-transparent p-0 text-left"
                  >
                    <span className={cn("block text-[14px] font-bold", ink)}>
                      Schedule for later
                    </span>
                    <span className={cn("mt-0.5 block text-[12px]", muted)}>
                      Pick a date and time (within the next 7 days).
                    </span>
                  </button>
                  {bookingType === "scheduled" ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <input
                        type="date"
                        value={schedDate}
                        min={nowTs ? localDateStr(nowTs) : ""}
                        max={
                          nowTs ? localDateStr(nowTs + SCHEDULE_MAX_MS) : ""
                        }
                        onChange={(e) => setSchedDate(e.target.value)}
                        className={cn(
                          "h-11 w-full rounded-md border-0 px-3 text-[14px] font-medium outline-none",
                          isLight
                            ? "bg-black/8 text-slate-900"
                            : "bg-[#2c2c2e] text-white",
                        )}
                      />
                      <input
                        type="time"
                        value={schedTime}
                        onChange={(e) => setSchedTime(e.target.value)}
                        className={cn(
                          "h-11 w-full rounded-md border-0 px-3 text-[14px] font-medium outline-none",
                          isLight
                            ? "bg-black/8 text-slate-900"
                            : "bg-[#2c2c2e] text-white",
                        )}
                      />
                      {!scheduleValid && (schedDate || schedTime) ? (
                        <p className="text-[11px] font-semibold text-red-500">
                          Pick a time between now and 7 days ahead.
                        </p>
                      ) : null}
                      {schedDate || schedTime ? (
                        <p
                          className={cn(
                            "text-[10px] font-semibold tabular-nums",
                            muted,
                          )}
                        >
                          Captured · date: {schedDate || "none"} · time:{" "}
                          {schedTime || "none"}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {stage === "location" ? (
              <div className="flex flex-col gap-3 pt-1">
                <AddressAutocomplete
                  value={pickedLoc}
                  onChange={(picked) => {
                    setPickedLoc(picked);
                    setError(null);
                  }}
                />
                <p className={cn("px-1 text-[11px] font-medium", muted)}>
                  Call-out is charged on the real road-route distance at
                  ₦350/km.
                </p>
              </div>
            ) : null}

            {stage === "urgency" && quote ? (
              <div className="flex flex-col gap-2">
                <p className={cn("mt-2 px-0.5 pb-1 text-[14px] font-bold capitalize leading-snug", ink)}>
                  How urgent is this?
                </p>
                <div className="flex flex-col gap-1">
                  {URGENCY_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void pickUrgency(o.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-[4px] border-0 px-3 py-3.5 text-left transition-transform duration-150 active:scale-[0.985]",
                        rowCard
                      )}
                    >
                      <span className={cn("text-[13px] font-bold", ink)}>
                        {o.label}
                      </span>
                      <span className={cn("text-[12px] font-semibold", muted)}>
                        {o.mult}× {o.id === "normal" ? "" : "· extra call-out"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {stage === "pay" &&
            quote &&
            !bankPay &&
            !busy ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-[#FF6B35]" />
                <p className={cn("text-[13px] font-medium", muted)}>
                  Opening secure payment…
                </p>
              </div>
            ) : null}

            {stage === "pay" && quote ? (
              <>
                <div>
                  <div className="flex flex-col gap-3 pt-1">
                    <div className={cn("rounded-[4px] px-3 py-3", rowCard)}>
                      <Row
                        label={`Base fee · ${quote.trade === "mechanic" ? "Mechanic" : "Express service"}`}
                        value={naira(quote.baseChargeMajor)}
                        ink={ink}
                      />
                      <Row
                        label={
                          quote.distanceChargeMajor > 0
                            ? `Call-out fee · ${quote.distanceKm ?? "?"} km × ₦350`
                            : "Call-out fee"
                        }
                        value={naira(quote.calloutMajor)}
                        ink={ink}
                      />
                      {quote.urgencyMultiplier !== 1 ? (
                        <>
                          <Row
                            label={`Urgency · ${URGENCY_LABEL[quote.urgency] ?? quote.urgency} ×${quote.urgencyMultiplier}`}
                            value={`+${naira(quote.urgencySurchargeMajor)}`}
                            ink={ink}
                          />
                          <Row
                            label="Subtotal before urgency"
                            value={naira(
                              Math.max(
                                0,
                                quote.totalMajor - quote.urgencySurchargeMajor,
                              ),
                            )}
                            ink={ink}
                          />
                        </>
                      ) : null}
                      <div className="mt-2 border-t border-black/5 pt-2 dark:border-white/10">
                        <Row
                          label="Total call-out + base"
                          value={naira(quote.totalMajor)}
                          ink={ink}
                          bold
                        />
                      </div>
                    </div>
                    <p className={cn("px-1 text-[11px] font-medium", muted)}>
                      After payment, Ona instantly assigns the{" "}
                      {TRADE_LABEL[quote.trade] ?? quote.trade}.
                    </p>
                  </div>
                  {bankPay ? (
                    <div className={cn("rounded-[4px] px-3 py-3", rowCard)}>
                      <div className="mb-2 flex items-center justify-between">
                        <span
                          className={cn(
                            "flex items-center gap-1.5 text-[13px] font-extrabold",
                            ink,
                          )}
                        >
                          <Lock className="h-4 w-4 text-[#FF6B35]" />
                          Bank transfer
                        </span>
                        <PayCountdown deadline={bankPay.sessionEndsAt} />
                      </div>
                      <DetailRow
                        label="Account name"
                        value={bankPay.accountName}
                        ink={ink}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(bankPay.accountNumber)
                            .catch(() => undefined);
                          setCopiedKey("number");
                          window.setTimeout(
                            () => setCopiedKey(null),
                            1500,
                          );
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 border-0 bg-transparent py-1.5 text-left",
                        )}
                        aria-label="Copy account number"
                      >
                        <span className="min-w-0">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">
                            Account number · tap to copy
                          </span>
                          <span
                            className={cn(
                              "block truncate text-[14px] font-bold tabular-nums",
                              ink,
                            )}
                          >
                            {bankPay.accountNumber}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] font-bold",
                            copiedKey === "number"
                              ? "text-[#FF6B35]"
                              : muted,
                          )}
                        >
                          {copiedKey === "number" ? "Copied" : ""}
                        </span>
                      </button>
                      <DetailRow label="Bank" value={bankPay.bankName} ink={ink} />
                      <DetailRow
                        label="Amount"
                        value={naira(bankPay.amountMajor)}
                        ink={ink}
                      />
                      <p
                        className={cn(
                          "mt-2 flex items-center gap-1.5 px-0.5 text-[11px] font-medium",
                          muted,
                        )}
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Transfer the exact amount only. Waiting for your
                        payment…
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="absolute inset-x-3 bottom-2">
                  <div
                    className={cn(
                      "flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand text-[15px] font-bold text-white",
                    )}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Waiting for payment…
                  </div>
                  {!cancelAsk ? (
                    <button
                      type="button"
                      onClick={() => setCancelAsk(true)}
                      className={cn(
                        "mt-1 h-9 w-full border-0 bg-transparent text-[12px] font-semibold underline-offset-2 hover:underline",
                        muted,
                      )}
                    >
                      Cancel this request
                    </button>
                  ) : (
                    <div className="mt-1 flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={cancelBusy}
                        onClick={() => void cancelPay("both")}
                        className={cn(
                          "h-9 w-full rounded-md border-0 bg-black/8 text-[12px] font-bold text-red-500 dark:bg-white/10",
                          "disabled:opacity-50",
                        )}
                      >
                        Cancel payment and request
                      </button>
                      <button
                        type="button"
                        disabled={cancelBusy}
                        onClick={() => void cancelPay("payment")}
                        className={cn(
                          "h-9 w-full rounded-md border-0 bg-black/8 text-[12px] font-bold",
                          ink,
                          "disabled:opacity-50",
                        )}
                      >
                        Cancel payment only
                      </button>
                      <button
                        type="button"
                        disabled={cancelBusy}
                        onClick={() => setCancelAsk(false)}
                        className={cn(
                          "h-8 w-full border-0 bg-transparent text-[12px] font-semibold",
                          muted,
                        )}
                      >
                        Keep paying
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {error ? (
              <p className="mt-2 text-[12px] font-semibold text-red-500">
                {error}
              </p>
            ) : null}
          </div>
        )}

        {(stage === "questions" ||
          stage === "booking" ||
          stage === "location") &&
        !(
          stage === "questions" &&
          screen?.kind === "choice"
        ) ? (
          <div className="absolute inset-x-3 bottom-2">
            {stage === "questions" && screen?.kind === "text" ? (
              <button
                type="button"
                disabled={!canAdvance(draft)}
                onClick={submitText}
                className="mb-1 h-11 w-full rounded-md border-0 bg-brand text-[14px] font-bold text-white disabled:opacity-50"
              >
                Continue
              </button>
            ) : null}
            {stage === "booking" && bookingType === "scheduled" ? (
              <>
                <button
                  type="button"
                  disabled={!schedDate || !schedTime}
                  onClick={() => {
                    if (!scheduleValid) {
                      setError("Pick a time between now and 7 days ahead.");
                      return;
                    }
                    setError(null);
                    goLocation();
                  }}
                  className="mb-1 h-11 w-full rounded-md border-0 bg-brand text-[14px] font-bold text-white disabled:opacity-50"
                >
                  Continue
                </button>
                {!scheduleValid && schedDate && schedTime ? (
                  <p className="mb-1 text-center text-[11px] font-semibold text-red-500">
                    Pick a time between now and 7 days ahead.
                  </p>
                ) : null}
              </>
            ) : null}
            {stage === "location" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmLocation()}
                className="mb-1 h-11 w-full rounded-md border-0 bg-brand text-[14px] font-bold text-white disabled:opacity-50"
              >
                {busy ? "Pricing…" : "See price"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={goBack}
              className={cn(
                "h-10 w-full rounded-md border-0 text-[14px] font-bold",
                actionFlat(isLight),
              )}
            >
              Back
            </button>
          </div>
        ) : null}

      </div>
    </>
  );
}

/** mm:ss pay-window countdown, turns red under 15s (mirrors checkout). */
function PayCountdown({ deadline }: { deadline: string }) {
  const { displayMs } = useExactCountdown(deadline);
  const secs = Math.max(0, Math.ceil(displayMs / 1000));
  const label = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <span
      className={cn(
        "text-[12px] font-bold tabular-nums",
        secs <= 15_000 ? "text-red-500" : "text-[#FF6B35]",
      )}
    >
      {label}
    </span>
  );
}

function DetailRow({
  label,
  value,
  ink,
}: {
  label: string;
  value: string;
  ink: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
        {label}
      </p>
      <p className={cn("min-w-0 truncate text-[14px] font-bold", ink)}>
        {value}
      </p>
    </div>
  );
}

function localDateStr(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function canAdvance(value: string): boolean {
  return value.trim().length > 2;
}

function actionFlat(isLight: boolean): string {
  return isLight ? "text-slate-700" : "text-white/85";
}

function Row({
  label,
  value,
  ink,
  bold,
}: {
  label: string;
  value: string;
  ink: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span
        className={cn(
          "text-[12px]",
          bold ? "font-extrabold" : "font-semibold",
          ink,
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-[13px]",
          bold ? "font-extrabold" : "font-bold",
          ink,
        )}
      >
        {value}
      </span>
    </div>
  );
}
