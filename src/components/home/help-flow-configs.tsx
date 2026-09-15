import type React from "react";
import { Check } from "lucide-react";
import type { CalloutUrgencyKind } from "@/lib/callout/urgency";
import type { JobMedia } from "@/lib/jobs/types";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PRO_SERVICE_LABELS } from "@/lib/pro-service-id";

/* -------------------------------------------------------------------------- */
/*  Shared types                                                               */
/* -------------------------------------------------------------------------- */

export interface BaseRoute {
  trade?: ProService;
  vehicleLabel?: string;
  manualVehicles?: import("@/lib/types").MotoristVehicle[];
  route: string[];
  answers: Record<string, string>;
  urgency?: CalloutUrgencyKind;
}

export type ExtraSnapshot = Record<string, unknown>;

export type ScreenFn = (id: string) => { kind: string; label?: string; question?: string; placeholder?: string; options?: Array<{ id: string; label: string }> } | undefined;

export type NextScreenFn = (
  current: string,
  answer: string,
  answers: Record<string, string>,
) => string | null;

export type CanAdvanceTextFn = (draft: string) => boolean;

export type ComposeProblemFn = (
  answers: Record<string, string>,
  extra: string,
  landmark: string,
  options?: { destination?: string; colour?: string },
) => string;

export type ResolveRouteFn = (
  answers: Record<string, string>,
) => { trade: ProService; route: string[]; answers: Record<string, string> };

export type ApplyConfirmFn = (
  route: BaseRoute & { trade: ProService },
  yes: boolean,
) => ProService;

export type ConfirmQuestionFn = (trade: ProService) => string;

export interface UrgencyChip {
  id: CalloutUrgencyKind;
  label: string;
  fee: string;
}

export interface BuildPayloadInput {
  answers: Record<string, string>;
  extra: string;
  landmark: string;
  vehicleLabel: string;
  photos: import("@/lib/jobs/types").JobMedia[];
  voiceNote: import("@/lib/jobs/types").JobMedia | null;
  pickedLoc: import("@/components/map/location-picker-map").PickedLocation | null;
  urgency: CalloutUrgencyKind;
  extraState: ExtraSnapshot;
}

export interface BuildPayloadResult {
  serviceType: ProService;
  problem: string;
  motoristVehicle: string | null;
  extraPayload?: Record<string, unknown>;
}

export type OnPushFn = (
  next: string,
  answers: Record<string, string>,
  ctx: {
    setStack: React.Dispatch<React.SetStateAction<string[]>>;
    setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    setExtraState: React.Dispatch<React.SetStateAction<ExtraSnapshot>>;
    setChosenTrade: React.Dispatch<React.SetStateAction<ProService>>;
    setFinalStep: React.Dispatch<React.SetStateAction<string>>;
    route: BaseRoute | null;
    setError?: React.Dispatch<React.SetStateAction<string | null>>;
  },
) => boolean;

export type OnAcceptRouteFn = (
  yes: boolean,
  ctx: {
    route: BaseRoute | null;
    setChosenTrade: React.Dispatch<React.SetStateAction<ProService>>;
    setFinalStep: React.Dispatch<React.SetStateAction<string>>;
    setStack: React.Dispatch<React.SetStateAction<string[]>>;
    setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    setExtraState: React.Dispatch<React.SetStateAction<ExtraSnapshot>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  },
) => boolean;

export type OnPickFn = (
  step: string,
  answer: string,
  ctx: {
    setStack: React.Dispatch<React.SetStateAction<string[]>>;
    setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  },
) => boolean;

export interface HelpFlowConfig {
  sessionKey: string;
  hasVehicleStep?: boolean;
  defaultStack: string[];
  defaultTrade: ProService;
  nearestProServices: ProService[];
  resolveRoute?: ResolveRouteFn;
  applyConfirmChoice?: ApplyConfirmFn;
  confirmQuestion?: ConfirmQuestionFn;
  confirmStage?: "primary" | "alternate";
  onPush?: OnPushFn;
  onAcceptRoute?: OnAcceptRouteFn;
  onPick?: OnPickFn;
  screen: ScreenFn;
  nextScreen: NextScreenFn;
  startOptions?: ReadonlyArray<{ id: string; label: string }>;
  urgencyChips: UrgencyChip[];
  canAdvanceText: CanAdvanceTextFn;
  composeProblem: ComposeProblemFn;
  finalSteps: string[];
  finalCopy: Record<string, string>;
  progressDefaultTotal: number;
  sendLabel: string;
  busyLabel: string;
  buildPayload: (input: BuildPayloadInput) => BuildPayloadResult;
  maxPhotos: number;
  minPhotos: number;
  computeUnsafe?: (answers: Record<string, string>) => boolean;
  computeCanSend?: (ctx: {
    finalStep: string;
    photos: import("@/lib/jobs/types").JobMedia[];
    extraState: ExtraSnapshot;
    answers: Record<string, string>;
  }) => boolean;
  renderExtraFinalStep?: (props: {
    field?: string;
    value?: string;
    onChange?: (v: string) => void;
    isLight: boolean;
    finalStep: string;
    extraState: ExtraSnapshot;
    setExtraState: React.Dispatch<React.SetStateAction<ExtraSnapshot>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    ink: string;
    muted: string;
    rowCard: string;
    chipIdle: string;
    actionFlat: string;
    answers: Record<string, string>;
  }) => React.ReactNode;
  restoreExtraSnapshot?: (
    snap: ExtraSnapshot,
    setExtraState: React.Dispatch<React.SetStateAction<ExtraSnapshot>>,
  ) => void;
  collectExtraSnapshot?: (
    state: ExtraSnapshot,
  ) => ExtraSnapshot | null;
}

/* -------------------------------------------------------------------------- */
/*  Tow                                                                        */
/* -------------------------------------------------------------------------- */
import {
  towScreen,
  nextTowScreen,
  composeTowProblem,
  canAdvanceText as towCanAdvance,
  TOW_START_OPTIONS,
  TOW_MAX_PHOTOS,
  TOW_MIN_PHOTOS,
  TOW_FINAL_COPY,
  resolveTowRoute,
  applyTowConfirmChoice,
  confirmQuestion as towConfirmQuestion,
  canFindTowPro,
  type TowRoute,
} from "@/lib/tow/question-tree";

/* -------------------------------------------------------------------------- */
/*  Mechanic                                                                   */
/* -------------------------------------------------------------------------- */
import {
  mechanicScreen,
  nextMechanicScreen,
  composeMechanicProblem,
  canAdvanceText as mechCanAdvance,
  MECHANIC_START_OPTIONS,
  MECHANIC_MAX_PHOTOS,
  MECHANIC_FINAL_COPY,
  resolveMechanicRoute,
  applyConfirmChoice as mechApplyConfirm,
  confirmQuestion as mechConfirmQuestion,
} from "@/lib/mechanic/question-tree";

/* -------------------------------------------------------------------------- */
/*  Battery                                                                    */
/* -------------------------------------------------------------------------- */
import {
  batteryScreen,
  nextBatteryScreen,
  composeBatteryProblem,
  canAdvanceText as batCanAdvance,
  BATTERY_START_OPTIONS,
  BATTERY_MAX_PHOTOS,
  BATTERY_FINAL_COPY,
  resolveBatteryRoute,
  applyConfirmChoice as batApplyConfirm,
  confirmQuestion as batConfirmQuestion,
  type BatteryRoute,
} from "@/lib/battery/question-tree";

/* -------------------------------------------------------------------------- */
/*  Body                                                                       */
/* -------------------------------------------------------------------------- */
import {
  bodyScreen,
  nextBodyScreen,
  composeBodyProblem,
  canAdvanceText as bodyCanAdvance,
  BODY_START_OPTIONS,
  BODY_MAX_PHOTOS,
  BODY_MIN_PHOTOS,
  BODY_FINAL_COPY,
} from "@/lib/body/question-tree";

/* -------------------------------------------------------------------------- */
/*  Vulcanizer                                                                 */
/* -------------------------------------------------------------------------- */
import {
  vulcanizerScreen,
  nextVulcanizerScreen,
  composeVulcanizerProblem,
  canAdvanceText as vulcCanAdvance,
  VULCANIZER_START_OPTIONS,
  VULCANIZER_MAX_PHOTOS,
  VULCANIZER_FINAL_COPY,
  resolveVulcanizerRoute,
  applyVulcanizerConfirmChoice,
  confirmQuestion as vulcConfirmQuestion,
  type VulcanizerRoute,
} from "@/lib/vulcanizer/question-tree";

/* -------------------------------------------------------------------------- */
/*  AC                                                                         */
/* -------------------------------------------------------------------------- */
import {
  acScreen,
  nextAcScreen,
  composeAcProblem,
  canAdvanceText as acCanAdvance,
  AC_START_OPTIONS,
  AC_MAX_PHOTOS,
  AC_FINAL_COPY,
} from "@/lib/ac/question-tree";

/* -------------------------------------------------------------------------- */
/*  Electrical                                                                 */
/* -------------------------------------------------------------------------- */
import {
  electricalScreen,
  nextElectricalScreen,
  composeElectricalProblem,
  canAdvanceText as elecCanAdvance,
  ELECTRICAL_START_OPTIONS,
  ELECTRICAL_MAX_PHOTOS,
  ELECTRICAL_FINAL_COPY,
} from "@/lib/electrical/question-tree";

/* -------------------------------------------------------------------------- */
/*  Diagnostics                                                                */
/* -------------------------------------------------------------------------- */
import {
  scanScreen,
  nextScanScreen,
  composeScanProblem,
  canAdvanceText as diagCanAdvance,
  SCAN_START_OPTIONS,
  SCAN_MAX_PHOTOS,
  SCAN_MIN_PHOTOS,
  SCAN_FINAL_COPY,
  resolveScanRoute,
  applyConfirmChoice as diagApplyConfirm,
  confirmQuestion as diagConfirmQuestion,
  type ScanRoute,
} from "@/lib/diagnostics/question-tree";

/* -------------------------------------------------------------------------- */
/*  Solar                                                                      */
/* -------------------------------------------------------------------------- */
import {
  solarScreen,
  nextSolarScreen,
  composeSolarProblem,
  canAdvanceText as solarCanAdvance,
  SOLAR_START_OPTIONS,
  SOLAR_MAX_PHOTOS,
  SOLAR_MIN_PHOTOS,
  SOLAR_FINAL_COPY,
  SOLAR_SUPPLY_OPTIONS,
  resolveSolarRoute,
  applyConfirmChoice as solarApplyConfirm,
  confirmQuestion as solarConfirmQuestion,
  type SolarRoute,
} from "@/lib/solar/question-tree";

/* -------------------------------------------------------------------------- */
/*  Generator                                                                  */
/* -------------------------------------------------------------------------- */
import {
  genScreen,
  nextGeneratorScreen,
  composeGeneratorProblem,
  canAdvanceText as genCanAdvance,
  GEN_START_OPTIONS,
  GEN_MAX_PHOTOS,
  GEN_MIN_PHOTOS,
  GEN_FINAL_COPY,
  GEN_SUPPLY_OPTIONS,
  resolveGeneratorRoute,
  applyConfirmChoice as genApplyConfirm,
  confirmQuestion as genConfirmQuestion,
  type GenRoute,
} from "@/lib/generator/question-tree";

/* -------------------------------------------------------------------------- */
/*  Plumber                                                                    */
/* -------------------------------------------------------------------------- */
import {
  plumberScreen,
  nextPlumberScreen,
  composePlumberProblem,
  canAdvanceText as plumCanAdvance,
  PLUMBER_START_OPTIONS,
  PLUMBER_MAX_PHOTOS,
  PLUMBER_MIN_PHOTOS,
  PLUMBER_FINAL_COPY,
  PLUMBER_PROPERTY_OPTIONS,
} from "@/lib/plumber/question-tree";

/* -------------------------------------------------------------------------- */
/*  Carpenter                                                                  */
/* -------------------------------------------------------------------------- */
import {
  carpenterScreen,
  composeCarpenterJob,
  canAdvanceText as carpCanAdvance,
  CARPENTER_START_OPTIONS,
  CARPENTER_MAX_PHOTOS,
  CARPENTER_MIN_PHOTOS,
  CARPENTER_FINAL_COPY,
  CARPENTER_MEASUREMENTS_OPTIONS,
  nextCarpenterScreen,
} from "@/lib/carpenter/question-tree";

/* -------------------------------------------------------------------------- */
/*  Painter                                                                    */
/* -------------------------------------------------------------------------- */
import {
  painterScreen,
  nextPainterScreen,
  composePainterJob,
  canAdvanceText as paintCanAdvance,
  PAINTER_START_OPTIONS,
  PAINTER_MAX_PHOTOS,
  PAINTER_MIN_PHOTOS,
  PAINTER_FINAL_COPY,
  PAINTER_SUPPLY_OPTIONS,
  PAINTER_SCAFFOLD_OPTIONS,
} from "@/lib/painter/question-tree";

/* -------------------------------------------------------------------------- */
/*  Fashion                                                                    */
/* -------------------------------------------------------------------------- */
import {
  fashionScreen,
  nextFashionScreen,
  composeFashionProblem,
  canAdvanceText as fashCanAdvance,
  FASHION_START_OPTIONS,
  FASHION_MAX_PHOTOS,
  FASHION_MIN_PHOTOS,
  FASHION_FINAL_COPY,
} from "@/lib/fashion/question-tree";

/* ======================================================================== */
/*  Common urgency chips                                                      */
/* ======================================================================== */

function makeUrgencyChips(copy: {
  normal: string;
  emergency: string;
  remote: string;
  night: string;
}): UrgencyChip[] {
  return [
    { id: "normal", label: copy.normal, fee: "1x · base + call-out" },
    { id: "emergency", label: copy.emergency, fee: "1.25x · base + call-out" },
    { id: "remote", label: copy.remote, fee: "1.35x · base + call-out" },
    { id: "night", label: copy.night, fee: "1.5x · base + call-out" },
  ];
}

/* ======================================================================== */
/*  Common buildPayload helper                                                */
/* ======================================================================== */

function defaultBuildPayload(
  trade: ProService,
  compose: ComposeProblemFn,
  ctx: Parameters<HelpFlowConfig["buildPayload"]>[0],
): BuildPayloadResult {
  return {
    serviceType: trade,
    problem: [compose(ctx.answers, ctx.extra, ctx.landmark)]
      .filter(Boolean)
      .join("\n"),
    motoristVehicle: ctx.vehicleLabel || null,
  };
}

/* ======================================================================== */
/*  Tow config                                                               */
/* ======================================================================== */

const towConfig: HelpFlowConfig = {
  sessionKey: "ona-tow-flow-session",
  screen: towScreen as ScreenFn,
  nextScreen: nextTowScreen as NextScreenFn,
  canAdvanceText: towCanAdvance as CanAdvanceTextFn,
  composeProblem: composeTowProblem as ComposeProblemFn,
  startOptions: TOW_START_OPTIONS,
  resolveRoute: resolveTowRoute as unknown as ResolveRouteFn,
  applyConfirmChoice: applyTowConfirmChoice as unknown as ApplyConfirmFn,
  confirmQuestion: towConfirmQuestion as unknown as ConfirmQuestionFn,
  hasVehicleStep: true,
  defaultStack: ["vehicle"],
  defaultTrade: "towing",
  nearestProServices: ["towing"],
  urgencyChips: makeUrgencyChips(TOW_FINAL_COPY),
  maxPhotos: TOW_MAX_PHOTOS,
  minPhotos: TOW_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "destination", "colour", "meetPro"],
  finalCopy: {
    urgency: TOW_FINAL_COPY.urgency,
    photos: TOW_FINAL_COPY.photos,
    voice: TOW_FINAL_COPY.voice,
    location: TOW_FINAL_COPY.location,
    destination: TOW_FINAL_COPY.destination,
    colour: TOW_FINAL_COPY.colour,
    meetPro: TOW_FINAL_COPY.meetPro,
  },
  progressDefaultTotal: 13,
  sendLabel: "Find a Tow Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const meetPro = (ctx.extraState.meetPro as "yes" | "no" | null) ?? null;
    const meetProTrade = (ctx.extraState.meetProTrade as ProService | null) ?? null;
    const destination = (ctx.extraState.destination as string) ?? "";
    const colour = (ctx.extraState.colour as string) ?? "";
    const problem = [
      composeTowProblem(ctx.answers, ctx.extra, ctx.landmark, { destination, colour }),
      meetPro === "yes" && meetProTrade
        ? `Also send a ${PRO_SERVICE_LABELS[meetProTrade]} to meet me at the destination.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      serviceType: "towing",
      problem,
      motoristVehicle: ctx.vehicleLabel || null,
      extraPayload: {
        meetPro: meetPro === "yes",
        meetProTrade: meetPro === "yes" ? meetProTrade : null,
      },
    };
  },
  computeCanSend: ({ finalStep, photos, extraState }) => {
    if (!canFindTowPro(photos.length)) return false;
    if (finalStep === "meetPro") {
      const meetPro = (extraState.meetPro as "yes" | "no" | null) ?? null;
      const meetProTrade = extraState.meetProTrade as ProService | null;
      return meetPro === "no" || (meetPro === "yes" && meetProTrade !== null);
    }
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      destination: (snap as Record<string, unknown>).destination ?? "",
      colour: (snap as Record<string, unknown>).colour ?? "",
      meetPro: (snap as Record<string, unknown>).meetPro ?? null,
      meetProTrade: (snap as Record<string, unknown>).meetProTrade ?? null,
    });
  },
  collectExtraSnapshot: (state) => ({
    destination: state.destination,
    colour: state.colour,
    meetPro: state.meetPro,
    meetProTrade: state.meetProTrade,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    isLight,
    ink,
    muted,
    field,
    rowCard,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep === "destination") {
      return (
        <input
          value={(extraState.destination as string) ?? ""}
          onChange={(e) => {
            setExtraState({ ...extraState, destination: e.target.value });
            setError(null);
          }}
          placeholder="Workshop name or area"
          className={cn(
            "w-full rounded-xl border-0 px-3 py-2 text-[13px] font-medium outline-none",
            field,
          )}
        />
      );
    }
    if (finalStep === "colour") {
      return (
        <input
          value={(extraState.colour as string) ?? ""}
          onChange={(e) => {
            setExtraState({ ...extraState, colour: e.target.value });
            setError(null);
          }}
          placeholder="e.g. Black, Silver, Red"
          className={cn(
            "w-full rounded-xl border-0 px-3 py-2 text-[13px] font-medium outline-none",
            field,
          )}
        />
      );
    }
    if (finalStep === "meetPro") {
      const meetPro = (extraState.meetPro as "yes" | "no" | null) ?? null;
      const meetProTrade = (extraState.meetProTrade as ProService | null) ?? null;
      const MEET_PRO_OPTIONS: ProService[] = [
        "mechanic", "vulcanizer", "body", "battery", "electrical", "ac",
      ];
      return (
        <div className="space-y-2">
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setExtraState({ ...extraState, meetPro: "yes" });
              }}
              className="flex w-full items-center gap-2 rounded-[4px] border-0 px-1 py-3 text-left transition-transform duration-150 active:scale-[0.985]"
            >
              <span className={cn("text-[13px] font-semibold", ink)}>
                {TOW_FINAL_COPY.meetProYes}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setExtraState({ ...extraState, meetPro: "no", meetProTrade: null });
              }}
              className="flex w-full items-center gap-2 rounded-[4px] border-0 px-1 py-3 text-left transition-transform duration-150 active:scale-[0.985]"
            >
              <span className={cn("text-[13px] font-semibold", ink)}>
                {TOW_FINAL_COPY.meetProNo}
              </span>
            </button>
          </div>
          {meetPro === "yes" ? (
            <div className="pt-1">
              <p className={cn("pb-1 text-[12px] font-bold", ink)}>
                Select the repair pro to meet you
              </p>
              <div className="flex flex-col gap-1">
                {MEET_PRO_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setExtraState({ ...extraState, meetProTrade: t });
                      setError(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[4px] border-0 px-1 py-3 text-left transition-transform duration-150 active:scale-[0.985]",
                      rowCard,
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[13px] font-semibold capitalize leading-snug",
                        meetProTrade === t ? "text-[#FF6B35]" : ink,
                      )}
                    >
                      {PRO_SERVICE_LABELS[t]}
                    </span>
                    {meetProTrade === t ? (
                      <Check className="h-4 w-4 shrink-0 text-[#FF6B35]" strokeWidth={2.5} />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    return null;
  },
};

/* ======================================================================== */
/*  Mechanic config                                                          */
/* ======================================================================== */

const mechanicConfig: HelpFlowConfig = {
  sessionKey: "ona-mech-flow-session",
  screen: mechanicScreen as ScreenFn,
  nextScreen: nextMechanicScreen as NextScreenFn,
  canAdvanceText: mechCanAdvance as CanAdvanceTextFn,
  composeProblem: composeMechanicProblem as ComposeProblemFn,
  startOptions: MECHANIC_START_OPTIONS,
  resolveRoute: resolveMechanicRoute as unknown as ResolveRouteFn,
  applyConfirmChoice: mechApplyConfirm as unknown as ApplyConfirmFn,
  confirmQuestion: mechConfirmQuestion as unknown as ConfirmQuestionFn,
  hasVehicleStep: true,
  defaultStack: ["vehicle"],
  defaultTrade: "mechanic",
  nearestProServices: ["mechanic"],
  urgencyChips: makeUrgencyChips(MECHANIC_FINAL_COPY),
  maxPhotos: MECHANIC_MAX_PHOTOS,
  minPhotos: 0,
  computeUnsafe: (answers) =>
    ["c_safe", "d_safe", "f_safe"].some((k) => answers[k] === "no"),
  finalSteps: ["urgency", "photos", "voice", "location"],
  finalCopy: {
    urgency: MECHANIC_FINAL_COPY.urgency,
    photos: MECHANIC_FINAL_COPY.photos,
    voice: MECHANIC_FINAL_COPY.voice,
    location: MECHANIC_FINAL_COPY.location,
  },
  progressDefaultTotal: 10,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => defaultBuildPayload("mechanic", composeMechanicProblem as ComposeProblemFn, ctx),
};

/* ======================================================================== */
/*  Battery config                                                           */
/* ======================================================================== */

const batteryConfig: HelpFlowConfig = {
  sessionKey: "ona-battery-flow-session",
  screen: batteryScreen as ScreenFn,
  nextScreen: nextBatteryScreen as NextScreenFn,
  canAdvanceText: batCanAdvance as CanAdvanceTextFn,
  composeProblem: composeBatteryProblem as ComposeProblemFn,
  startOptions: BATTERY_START_OPTIONS,
  resolveRoute: resolveBatteryRoute as unknown as ResolveRouteFn,
  applyConfirmChoice: batApplyConfirm as unknown as ApplyConfirmFn,
  confirmQuestion: batConfirmQuestion as unknown as ConfirmQuestionFn,
  hasVehicleStep: true,
  defaultStack: ["vehicle"],
  defaultTrade: "battery",
  nearestProServices: ["battery"],
  urgencyChips: makeUrgencyChips(BATTERY_FINAL_COPY),
  maxPhotos: BATTERY_MAX_PHOTOS,
  minPhotos: 0,
  finalSteps: ["urgency", "photos", "voice", "location", "tow"],
  finalCopy: {
    urgency: BATTERY_FINAL_COPY.urgency,
    photos: BATTERY_FINAL_COPY.photos,
    voice: BATTERY_FINAL_COPY.voice,
    location: BATTERY_FINAL_COPY.location,
    tow: BATTERY_FINAL_COPY.tow,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const towChoice = (ctx.extraState.towChoice as "tow" | "battery" | null) ?? null;
    const trade: ProService = towChoice === "tow" ? "towing" : "battery";
    const problem = [
      towChoice === "tow" ? "Needs tow to a safer place or workshop: Yes" : "",
      composeBatteryProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: trade, problem, motoristVehicle: ctx.vehicleLabel || null };
  },
  computeCanSend: ({ finalStep, extraState }) => {
    if (finalStep === "tow") {
      return (extraState.towChoice as string | null) !== null;
    }
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      towChoice: (snap as Record<string, unknown>).towChoice ?? null,
      towConfirming: (snap as Record<string, unknown>).towConfirming ?? false,
    });
  },
  collectExtraSnapshot: (state) => ({
    towChoice: state.towChoice,
    towConfirming: state.towConfirming,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "tow") return null;
    const towChoice = (extraState.towChoice as "tow" | "battery" | null) ?? null;
    const towConfirming = (extraState.towConfirming as boolean) ?? false;
    return (
      <div>
        <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
          {BATTERY_FINAL_COPY.tow}
        </p>
        {towConfirming ? (
          <div className="mt-3">
            <p className={cn("text-[13px] font-bold", ink)}>
              {batConfirmQuestion("towing")}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setExtraState({ ...extraState, towChoice: "tow", towConfirming: false });
                  setError(null);
                }}
                className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  setExtraState({ ...extraState, towChoice: "battery", towConfirming: false });
                  setError(null);
                }}
                className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}
              >
                No
              </button>
            </div>
          </div>
        ) : towChoice === null ? (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setExtraState({ ...extraState, towConfirming: true })}
              className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => {
                setExtraState({ ...extraState, towChoice: "battery" });
                setError(null);
              }}
              className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}
            >
              No
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-[13px] font-bold", ink)}>
              {towChoice === "tow" ? "Dispatch as: Tow" : "Dispatch as: Battery"}
            </span>
            <button
              type="button"
              onClick={() => setExtraState({ ...extraState, towChoice: null, towConfirming: false })}
              className={cn("border-0 text-[13px] font-bold", actionFlat)}
            >
              Change
            </button>
          </div>
        )}
      </div>
    );
  },
};

/* ======================================================================== */
/*  Body config                                                              */
/* ======================================================================== */

const bodyConfig: HelpFlowConfig = {
  sessionKey: "ona-body-flow-session",
  screen: bodyScreen as ScreenFn,
  nextScreen: nextBodyScreen as NextScreenFn,
  canAdvanceText: bodyCanAdvance as CanAdvanceTextFn,
  composeProblem: composeBodyProblem as ComposeProblemFn,
  startOptions: BODY_START_OPTIONS,
  hasVehicleStep: true,
  defaultStack: ["vehicle"],
  defaultTrade: "body",
  nearestProServices: ["body"],
  urgencyChips: makeUrgencyChips(BODY_FINAL_COPY),
  maxPhotos: BODY_MAX_PHOTOS,
  minPhotos: BODY_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "tow"],
  finalCopy: {
    urgency: BODY_FINAL_COPY.urgency,
    photos: BODY_FINAL_COPY.photos,
    voice: BODY_FINAL_COPY.voice,
    location: BODY_FINAL_COPY.location,
    tow: BODY_FINAL_COPY.tow,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const towChoice = (ctx.extraState.towChoice as "tow" | "body" | null) ?? null;
    const trade: ProService = towChoice === "tow" ? "towing" : "body";
    const problem = [
      towChoice === "tow" ? "Needs the vehicle towed: Yes" : "",
      composeBodyProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: trade, problem, motoristVehicle: ctx.vehicleLabel || null };
  },
  computeCanSend: ({ finalStep, extraState }) => {
    if (finalStep === "tow") return (extraState.towChoice as string | null) !== null;
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      towChoice: (snap as Record<string, unknown>).towChoice ?? null,
      towConfirming: (snap as Record<string, unknown>).towConfirming ?? false,
    });
  },
  collectExtraSnapshot: (state) => ({
    towChoice: state.towChoice,
    towConfirming: state.towConfirming,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "tow") return null;
    const towChoice = (extraState.towChoice as "tow" | "body" | null) ?? null;
    const towConfirming = (extraState.towConfirming as boolean) ?? false;
    return (
      <div>
        <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
          {BODY_FINAL_COPY.tow}
        </p>
        {towConfirming ? (
          <div className="mt-3">
            <p className={cn("text-[13px] font-bold", ink)}>This sounds like Tow. Continue?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "tow", towConfirming: false }); setError(null); }} className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]">Yes</button>
              <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "body", towConfirming: false }); setError(null); }} className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>No</button>
            </div>
          </div>
        ) : towChoice === null ? (
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setExtraState({ ...extraState, towConfirming: true })} className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]">Yes</button>
            <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "body" }); setError(null); }} className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>No</button>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-[13px] font-bold", ink)}>{towChoice === "tow" ? "Dispatch as: Tow" : "Dispatch as: Body"}</span>
            <button type="button" onClick={() => setExtraState({ ...extraState, towChoice: null, towConfirming: false })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
          </div>
        )}
      </div>
    );
  },
};

/* ======================================================================== */
/*  Vulcanizer config                                                        */
/* ======================================================================== */

const vulcanizerConfig: HelpFlowConfig = {
  sessionKey: "ona-vulc-flow-session",
  screen: vulcanizerScreen as ScreenFn,
  nextScreen: nextVulcanizerScreen as NextScreenFn,
  canAdvanceText: vulcCanAdvance as CanAdvanceTextFn,
  composeProblem: composeVulcanizerProblem as ComposeProblemFn,
  startOptions: VULCANIZER_START_OPTIONS,
  resolveRoute: resolveVulcanizerRoute as unknown as ResolveRouteFn,
  applyConfirmChoice: applyVulcanizerConfirmChoice as unknown as ApplyConfirmFn,
  confirmQuestion: vulcConfirmQuestion as unknown as ConfirmQuestionFn,
  hasVehicleStep: true,
  defaultStack: ["vehicle"],
  defaultTrade: "vulcanizer",
  nearestProServices: ["vulcanizer"],
  urgencyChips: makeUrgencyChips(VULCANIZER_FINAL_COPY),
  maxPhotos: VULCANIZER_MAX_PHOTOS,
  minPhotos: 0,
  finalSteps: ["urgency", "photos", "voice", "location", "tow"],
  finalCopy: {
    urgency: VULCANIZER_FINAL_COPY.urgency,
    photos: VULCANIZER_FINAL_COPY.photos,
    voice: VULCANIZER_FINAL_COPY.voice,
    location: VULCANIZER_FINAL_COPY.location,
    tow: VULCANIZER_FINAL_COPY.tow,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const towNeeded = (ctx.extraState.towNeeded as boolean) ?? false;
    const trade: ProService = towNeeded ? "towing" : "vulcanizer";
    const problem = [
      towNeeded ? "Needs the vehicle towed: Yes" : "",
      composeVulcanizerProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: trade, problem, motoristVehicle: ctx.vehicleLabel || null };
  },
  computeCanSend: ({ finalStep, extraState }) => {
    if (finalStep === "tow") return (extraState.towNeeded as boolean) !== null;
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      towNeeded: (snap as Record<string, unknown>).towNeeded ?? false,
      towPending: (snap as Record<string, unknown>).towPending ?? false,
    });
  },
  collectExtraSnapshot: (state) => ({
    towNeeded: state.towNeeded,
    towPending: state.towPending,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "tow") return null;
    const towNeeded = (extraState.towNeeded as boolean) ?? false;
    const towPending = (extraState.towPending as boolean) ?? false;
    return (
      <div>
        <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
          {VULCANIZER_FINAL_COPY.tow}
        </p>
        {towPending ? (
          <div className="mt-3">
            <p className={cn("text-[13px] font-bold", ink)}>
              {vulcConfirmQuestion("towing")}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setExtraState({ ...extraState, towNeeded: true, towPending: false }); setError(null); }} className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]">Yes</button>
              <button type="button" onClick={() => { setExtraState({ ...extraState, towNeeded: false, towPending: false }); setError(null); }} className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>No</button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-[13px] font-bold", ink)}>
              {towNeeded ? "Dispatch as: Tow" : "Dispatch as: Vulcanizer"}
            </span>
            <button type="button" onClick={() => setExtraState({ ...extraState, towNeeded: false, towPending: false })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
          </div>
        )}
      </div>
    );
  },
};

/* ======================================================================== */
/*  AC config                                                                */
/* ======================================================================== */

const acConfig: HelpFlowConfig = {
  sessionKey: "ona-ac-flow-session",
  screen: acScreen as ScreenFn,
  nextScreen: nextAcScreen as NextScreenFn,
  canAdvanceText: acCanAdvance as CanAdvanceTextFn,
  composeProblem: composeAcProblem as ComposeProblemFn,
  startOptions: AC_START_OPTIONS,
  hasVehicleStep: true,
  defaultStack: ["unit"],
  defaultTrade: "ac",
  nearestProServices: ["ac"],
  urgencyChips: makeUrgencyChips(AC_FINAL_COPY),
  maxPhotos: AC_MAX_PHOTOS,
  minPhotos: 0,
  finalSteps: ["urgency", "photos", "voice", "location"],
  finalCopy: {
    urgency: AC_FINAL_COPY.urgency,
    photos: AC_FINAL_COPY.photos,
    voice: AC_FINAL_COPY.voice,
    location: AC_FINAL_COPY.location,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => defaultBuildPayload("ac", composeAcProblem as ComposeProblemFn, ctx),
};

/* ======================================================================== */
/*  Electrical config                                                        */
/* ======================================================================== */

const electricalConfig: HelpFlowConfig = {
  sessionKey: "ona-electrical-flow-session",
  screen: electricalScreen as ScreenFn,
  nextScreen: nextElectricalScreen as NextScreenFn,
  canAdvanceText: elecCanAdvance as CanAdvanceTextFn,
  composeProblem: composeElectricalProblem as ComposeProblemFn,
  startOptions: ELECTRICAL_START_OPTIONS,
  hasVehicleStep: true,
  defaultStack: ["start"],
  defaultTrade: "electrical",
  nearestProServices: ["electrical", "towing"],
  urgencyChips: makeUrgencyChips(ELECTRICAL_FINAL_COPY),
  maxPhotos: ELECTRICAL_MAX_PHOTOS,
  minPhotos: 0,
  finalSteps: ["urgency", "photos", "voice", "location", "tow"],
  finalCopy: {
    urgency: ELECTRICAL_FINAL_COPY.urgency,
    photos: ELECTRICAL_FINAL_COPY.photos,
    voice: ELECTRICAL_FINAL_COPY.voice,
    location: ELECTRICAL_FINAL_COPY.location,
    tow: ELECTRICAL_FINAL_COPY.tow,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const towChoice = (ctx.extraState.towChoice as "tow" | "electrical" | null) ?? null;
    const trade: ProService = towChoice === "tow" ? "towing" : "electrical";
    const problem = [
      towChoice === "tow" ? "Needs the vehicle towed: Yes" : "",
      composeElectricalProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: trade, problem, motoristVehicle: ctx.vehicleLabel || null };
  },
  computeCanSend: ({ finalStep, extraState }) => {
    if (finalStep === "tow") return (extraState.towChoice as string | null) !== null;
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      towChoice: (snap as Record<string, unknown>).towChoice ?? null,
      towConfirming: (snap as Record<string, unknown>).towConfirming ?? false,
    });
  },
  collectExtraSnapshot: (state) => ({
    towChoice: state.towChoice,
    towConfirming: state.towConfirming,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    answers,
    ink,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "tow") return null;
    const isVehicleBranch = answers.start === "A";
    const towChoice = (extraState.towChoice as "tow" | "electrical" | null) ?? null;
    const towConfirming = (extraState.towConfirming as boolean) ?? false;
    return (
      <div>
        <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
          {ELECTRICAL_FINAL_COPY.tow}
        </p>
        {towConfirming ? (
          <div className="mt-3">
            <p className={cn("text-[13px] font-bold", ink)}>This sounds like Tow. Continue?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "tow", towConfirming: false }); setError(null); }} className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]">Yes</button>
              <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "electrical", towConfirming: false }); setError(null); }} className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>No</button>
            </div>
          </div>
        ) : towChoice === null ? (
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setExtraState({ ...extraState, towConfirming: true })} className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]">Yes</button>
            <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "electrical" }); setError(null); }} className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>No</button>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-[13px] font-bold", ink)}>{towChoice === "tow" ? "Dispatch as: Tow" : "Dispatch as: Electric"}</span>
            <button type="button" onClick={() => setExtraState({ ...extraState, towChoice: null, towConfirming: false })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
          </div>
        )}
      </div>
    );
  },
  onPush: (next, _nextAnswers, ctx) => {
    // Electrical has vehicle step that pushes to "a_symptom" instead of "start"
    // This is handled by the onPick callback, so we don't need special push logic
    return false;
  },
};

/* ======================================================================== */
/*  Diagnostics config                                                       */
/* ======================================================================== */

const diagnosticsConfig: HelpFlowConfig = {
  sessionKey: "ona-diagnostics-flow-session",
  screen: scanScreen as ScreenFn,
  nextScreen: nextScanScreen as NextScreenFn,
  canAdvanceText: diagCanAdvance as CanAdvanceTextFn,
  composeProblem: composeScanProblem as ComposeProblemFn,
  startOptions: SCAN_START_OPTIONS,
  resolveRoute: resolveScanRoute as unknown as ResolveRouteFn,
  applyConfirmChoice: diagApplyConfirm as unknown as ApplyConfirmFn,
  confirmQuestion: diagConfirmQuestion as unknown as ConfirmQuestionFn,
  hasVehicleStep: true,
  defaultStack: ["vehicle"],
  defaultTrade: "diagnostics",
  nearestProServices: ["diagnostics"],
  urgencyChips: makeUrgencyChips(SCAN_FINAL_COPY),
  maxPhotos: SCAN_MAX_PHOTOS,
  minPhotos: SCAN_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "tow"],
  finalCopy: {
    urgency: SCAN_FINAL_COPY.urgency,
    photos: SCAN_FINAL_COPY.photos,
    voice: SCAN_FINAL_COPY.voice,
    location: SCAN_FINAL_COPY.location,
    tow: SCAN_FINAL_COPY.tow,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const towChoice = (ctx.extraState.towChoice as "tow" | "diagnostics" | null) ?? null;
    const trade: ProService = towChoice === "tow" ? "towing" : "diagnostics";
    const problem = [
      towChoice === "tow" ? "Needs the vehicle towed: Yes" : "",
      composeScanProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: trade, problem, motoristVehicle: ctx.vehicleLabel || null };
  },
  computeCanSend: ({ finalStep, extraState }) => {
    if (finalStep === "tow") return (extraState.towChoice as string | null) !== null;
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      towChoice: (snap as Record<string, unknown>).towChoice ?? null,
      towConfirming: (snap as Record<string, unknown>).towConfirming ?? false,
    });
  },
  collectExtraSnapshot: (state) => ({
    towChoice: state.towChoice,
    towConfirming: state.towConfirming,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "tow") return null;
    const towChoice = (extraState.towChoice as "tow" | "diagnostics" | null) ?? null;
    const towConfirming = (extraState.towConfirming as boolean) ?? false;
    return (
      <div>
        <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
          {SCAN_FINAL_COPY.tow}
        </p>
        {towConfirming ? (
          <div className="mt-3">
            <p className={cn("text-[13px] font-bold", ink)}>This sounds like Tow. Continue?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "tow", towConfirming: false }); setError(null); }} className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]">Yes</button>
              <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "diagnostics", towConfirming: false }); setError(null); }} className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>No</button>
            </div>
          </div>
        ) : towChoice === null ? (
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setExtraState({ ...extraState, towConfirming: true })} className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white active:scale-[0.985]">Yes</button>
            <button type="button" onClick={() => { setExtraState({ ...extraState, towChoice: "diagnostics" }); setError(null); }} className={cn("h-11 flex-1 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>No</button>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-[13px] font-bold", ink)}>{towChoice === "tow" ? "Dispatch as: Tow" : "Dispatch as: Diagnostics"}</span>
            <button type="button" onClick={() => setExtraState({ ...extraState, towChoice: null, towConfirming: false })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
          </div>
        )}
      </div>
    );
  },
};

/* ======================================================================== */
/*  Solar config                                                             */
/* ======================================================================== */

const solarConfig: HelpFlowConfig = {
  sessionKey: "ona-solar-flow-session",
  screen: solarScreen as ScreenFn,
  nextScreen: nextSolarScreen as NextScreenFn,
  canAdvanceText: solarCanAdvance as CanAdvanceTextFn,
  composeProblem: composeSolarProblem as ComposeProblemFn,
  startOptions: SOLAR_START_OPTIONS,
  resolveRoute: resolveSolarRoute as unknown as ResolveRouteFn,
  applyConfirmChoice: solarApplyConfirm as unknown as ApplyConfirmFn,
  confirmQuestion: solarConfirmQuestion as unknown as ConfirmQuestionFn,
  hasVehicleStep: false,
  defaultStack: ["machine"],
  defaultTrade: "solar",
  nearestProServices: ["solar"],
  urgencyChips: makeUrgencyChips(SOLAR_FINAL_COPY),
  maxPhotos: SOLAR_MAX_PHOTOS,
  minPhotos: SOLAR_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "material"],
  finalCopy: {
    urgency: SOLAR_FINAL_COPY.urgency,
    photos: SOLAR_FINAL_COPY.photos,
    voice: SOLAR_FINAL_COPY.voice,
    location: SOLAR_FINAL_COPY.location,
    material: SOLAR_FINAL_COPY.load,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const supplyChoice = (ctx.extraState.supplyChoice as string) ?? null;
    const load = (ctx.extraState.load as string) ?? "";
    const supplyLabel =
      SOLAR_SUPPLY_OPTIONS.find((o) => o.id === supplyChoice)?.label ||
      supplyChoice ||
      "";
    const problem = [
      supplyLabel ? `${SOLAR_FINAL_COPY.supply} ${supplyLabel}` : "",
      load.trim() ? `${SOLAR_FINAL_COPY.load} ${load.trim()}` : "",
      composeSolarProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: "solar", problem, motoristVehicle: null };
  },
  computeCanSend: ({ finalStep, extraState, photos }) => {
    if (photos.length < SOLAR_MIN_PHOTOS) return false;
    if (finalStep === "material") {
      const supplyChoice = extraState.supplyChoice as string | null;
      const load = (extraState.load as string) ?? "";
      return supplyChoice !== null && load.trim().length > 0;
    }
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      load: (snap as Record<string, unknown>).load ?? "",
      supplyChoice: (snap as Record<string, unknown>).supplyChoice ?? null,
    });
  },
  collectExtraSnapshot: (state) => ({
    load: state.load,
    supplyChoice: state.supplyChoice,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    field,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "material") return null;
    const load = (extraState.load as string) ?? "";
    const supplyChoice = (extraState.supplyChoice as string) ?? null;
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
            {SOLAR_FINAL_COPY.load}
          </p>
          <textarea
            value={load}
            onChange={(e) => { setExtraState({ ...extraState, load: e.target.value }); setError(null); }}
            rows={2}
            placeholder="e.g. Lights, TV, fridge, pumping machine"
            className={cn("mt-1 w-full resize-none rounded-xl border-0 px-3 py-2 text-[13px] font-medium leading-snug outline-none", field)}
          />
        </div>
        <div>
          <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
            {SOLAR_FINAL_COPY.supply}
          </p>
          {supplyChoice === null ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SOLAR_SUPPLY_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" onClick={() => { setExtraState({ ...extraState, supplyChoice: opt.id }); setError(null); }} className={cn("h-11 rounded-md border-0 text-[13px] font-bold active:scale-[0.985]", chipIdle)}>
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={cn("text-[13px] font-bold", ink)}>
                {SOLAR_SUPPLY_OPTIONS.find((o) => o.id === supplyChoice)?.label ?? supplyChoice}
              </span>
              <button type="button" onClick={() => setExtraState({ ...extraState, supplyChoice: null })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
            </div>
          )}
        </div>
      </div>
    );
  },
};

/* ======================================================================== */
/*  Generator config                                                         */
/* ======================================================================== */

const generatorConfig: HelpFlowConfig = {
  sessionKey: "ona-generator-flow-session",
  screen: genScreen as ScreenFn,
  nextScreen: nextGeneratorScreen as NextScreenFn,
  canAdvanceText: genCanAdvance as CanAdvanceTextFn,
  composeProblem: composeGeneratorProblem as ComposeProblemFn,
  startOptions: GEN_START_OPTIONS,
  resolveRoute: resolveGeneratorRoute as unknown as ResolveRouteFn,
  applyConfirmChoice: genApplyConfirm as unknown as ApplyConfirmFn,
  confirmQuestion: genConfirmQuestion as unknown as ConfirmQuestionFn,
  hasVehicleStep: false,
  defaultStack: ["machine"],
  defaultTrade: "generator",
  nearestProServices: ["generator"],
  urgencyChips: makeUrgencyChips(GEN_FINAL_COPY),
  maxPhotos: GEN_MAX_PHOTOS,
  minPhotos: GEN_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "material"],
  finalCopy: {
    urgency: GEN_FINAL_COPY.urgency,
    photos: GEN_FINAL_COPY.photos,
    voice: GEN_FINAL_COPY.voice,
    location: GEN_FINAL_COPY.location,
    material: GEN_FINAL_COPY.size,
  },
  progressDefaultTotal: 12,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const supplyChoice = (ctx.extraState.supplyChoice as string) ?? null;
    const size = (ctx.extraState.size as string) ?? "";
    const supplyLabel =
      GEN_SUPPLY_OPTIONS.find((o) => o.id === supplyChoice)?.label ||
      supplyChoice ||
      "";
    const problem = [
      size.trim() ? `${GEN_FINAL_COPY.size} ${size.trim()}` : "",
      supplyLabel ? `${GEN_FINAL_COPY.supply} ${supplyLabel}` : "",
      composeGeneratorProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: "generator", problem, motoristVehicle: null };
  },
  computeCanSend: ({ finalStep, extraState, photos }) => {
    if (photos.length < GEN_MIN_PHOTOS) return false;
    if (finalStep === "material") {
      const supplyChoice = extraState.supplyChoice as string | null;
      const size = (extraState.size as string) ?? "";
      return supplyChoice !== null && size.trim().length > 0;
    }
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      size: (snap as Record<string, unknown>).size ?? "",
      supplyChoice: (snap as Record<string, unknown>).supplyChoice ?? null,
    });
  },
  collectExtraSnapshot: (state) => ({
    size: state.size,
    supplyChoice: state.supplyChoice,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    field,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "material") return null;
    const size = (extraState.size as string) ?? "";
    const supplyChoice = (extraState.supplyChoice as string) ?? null;
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
            {GEN_FINAL_COPY.size}
          </p>
          <textarea
            value={size}
            onChange={(e) => { setExtraState({ ...extraState, size: e.target.value }); setError(null); }}
            rows={2}
            placeholder="e.g. Diesel 7.5kVA"
            className={cn("mt-1 w-full resize-none rounded-xl border-0 px-3 py-2 text-[13px] font-medium leading-snug outline-none", field)}
          />
        </div>
        <div>
          <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
            {GEN_FINAL_COPY.supply}
          </p>
          {supplyChoice === null ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {GEN_SUPPLY_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" onClick={() => { setExtraState({ ...extraState, supplyChoice: opt.id }); setError(null); }} className={cn("h-11 rounded-md border-0 text-[13px] font-bold active:scale-[0.985]", chipIdle)}>
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={cn("text-[13px] font-bold", ink)}>
                {GEN_SUPPLY_OPTIONS.find((o) => o.id === supplyChoice)?.label ?? supplyChoice}
              </span>
              <button type="button" onClick={() => setExtraState({ ...extraState, supplyChoice: null })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
            </div>
          )}
        </div>
      </div>
    );
  },
};

/* ======================================================================== */
/*  Plumber config                                                           */
/* ======================================================================== */

const plumberConfig: HelpFlowConfig = {
  sessionKey: "ona-plumber-flow-session",
  screen: plumberScreen as ScreenFn,
  nextScreen: nextPlumberScreen as NextScreenFn,
  canAdvanceText: plumCanAdvance as CanAdvanceTextFn,
  composeProblem: composePlumberProblem as ComposeProblemFn,
  startOptions: PLUMBER_START_OPTIONS,
  hasVehicleStep: false,
  defaultStack: ["start"],
  defaultTrade: "plumber",
  nearestProServices: ["plumber"],
  urgencyChips: makeUrgencyChips(PLUMBER_FINAL_COPY),
  maxPhotos: PLUMBER_MAX_PHOTOS,
  minPhotos: PLUMBER_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "property"],
  finalCopy: {
    urgency: PLUMBER_FINAL_COPY.urgency,
    photos: PLUMBER_FINAL_COPY.photos,
    voice: PLUMBER_FINAL_COPY.voice,
    location: PLUMBER_FINAL_COPY.location,
    property: PLUMBER_FINAL_COPY.property,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const propertyChoice = (ctx.extraState.propertyChoice as string) ?? null;
    const propertyLabel =
      PLUMBER_PROPERTY_OPTIONS.find((o) => o.id === propertyChoice)?.label ||
      propertyChoice ||
      "";
    const problem = [
      propertyLabel ? `Type of property: ${propertyLabel}` : "",
      composePlumberProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: "plumber", problem, motoristVehicle: null };
  },
  computeCanSend: ({ finalStep, extraState, photos }) => {
    if (photos.length < PLUMBER_MIN_PHOTOS) return false;
    if (finalStep === "property") return (extraState.propertyChoice as string | null) !== null;
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      propertyChoice: (snap as Record<string, unknown>).propertyChoice ?? null,
    });
  },
  collectExtraSnapshot: (state) => ({
    propertyChoice: state.propertyChoice,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "property") return null;
    const propertyChoice = (extraState.propertyChoice as string) ?? null;
    return (
      <div>
        <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
          {PLUMBER_FINAL_COPY.property}
        </p>
        {propertyChoice === null ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PLUMBER_PROPERTY_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" onClick={() => { setExtraState({ ...extraState, propertyChoice: opt.id }); setError(null); }} className={cn("h-11 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-[13px] font-bold", ink)}>
              {propertyChoice === "other"
                ? "Other property type"
                : (PLUMBER_PROPERTY_OPTIONS.find((o) => o.id === propertyChoice)?.label ?? propertyChoice)}
            </span>
            <button type="button" onClick={() => setExtraState({ ...extraState, propertyChoice: null })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
          </div>
        )}
      </div>
    );
  },
};

/* ======================================================================== */
/*  Carpenter config                                                         */
/* ======================================================================== */

const carpenterConfig: HelpFlowConfig = {
  sessionKey: "ona-carpenter-flow-session",
  screen: carpenterScreen as ScreenFn,
  nextScreen: nextCarpenterScreen as NextScreenFn,
  canAdvanceText: carpCanAdvance as CanAdvanceTextFn,
  composeProblem: composeCarpenterJob as ComposeProblemFn,
  startOptions: CARPENTER_START_OPTIONS,
  hasVehicleStep: false,
  defaultStack: ["start"],
  defaultTrade: "carpenter",
  nearestProServices: ["carpenter"],
  urgencyChips: makeUrgencyChips(CARPENTER_FINAL_COPY),
  maxPhotos: CARPENTER_MAX_PHOTOS,
  minPhotos: CARPENTER_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "measurements"],
  finalCopy: {
    urgency: CARPENTER_FINAL_COPY.urgency,
    photos: CARPENTER_FINAL_COPY.photos,
    voice: CARPENTER_FINAL_COPY.voice,
    location: CARPENTER_FINAL_COPY.location,
    measurements: CARPENTER_FINAL_COPY.measurements,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const measurementsChoice = (ctx.extraState.measurementsChoice as string) ?? null;
    const measurementsLabel =
      CARPENTER_MEASUREMENTS_OPTIONS.find((o) => o.id === measurementsChoice)?.label ||
      measurementsChoice ||
      "";
    const problem = [
      measurementsLabel ? `${CARPENTER_FINAL_COPY.measurements} ${measurementsLabel}` : "",
      composeCarpenterJob(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: "carpenter", problem, motoristVehicle: null };
  },
  computeCanSend: ({ finalStep, extraState, photos }) => {
    if (photos.length < CARPENTER_MIN_PHOTOS) return false;
    if (finalStep === "measurements") return (extraState.measurementsChoice as string | null) !== null;
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      measurementsChoice: (snap as Record<string, unknown>).measurementsChoice ?? null,
    });
  },
  collectExtraSnapshot: (state) => ({
    measurementsChoice: state.measurementsChoice,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "measurements") return null;
    const measurementsChoice = (extraState.measurementsChoice as string) ?? null;
    return (
      <div>
        <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
          {CARPENTER_FINAL_COPY.measurements}
        </p>
        {measurementsChoice === null ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {CARPENTER_MEASUREMENTS_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" onClick={() => { setExtraState({ ...extraState, measurementsChoice: opt.id }); setError(null); }} className={cn("h-11 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-[13px] font-bold", ink)}>
              {CARPENTER_MEASUREMENTS_OPTIONS.find((o) => o.id === measurementsChoice)?.label ?? measurementsChoice}
            </span>
            <button type="button" onClick={() => setExtraState({ ...extraState, measurementsChoice: null })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
          </div>
        )}
      </div>
    );
  },
};

/* ======================================================================== */
/*  Painter config                                                           */
/* ======================================================================== */

const painterConfig: HelpFlowConfig = {
  sessionKey: "ona-painter-flow-session",
  screen: painterScreen as ScreenFn,
  nextScreen: nextPainterScreen as NextScreenFn,
  canAdvanceText: paintCanAdvance as CanAdvanceTextFn,
  composeProblem: composePainterJob as ComposeProblemFn,
  startOptions: PAINTER_START_OPTIONS,
  hasVehicleStep: false,
  defaultStack: ["start"],
  defaultTrade: "painter",
  nearestProServices: ["painter"],
  urgencyChips: makeUrgencyChips(PAINTER_FINAL_COPY),
  maxPhotos: PAINTER_MAX_PHOTOS,
  minPhotos: PAINTER_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "material"],
  finalCopy: {
    urgency: PAINTER_FINAL_COPY.urgency,
    photos: PAINTER_FINAL_COPY.photos,
    voice: PAINTER_FINAL_COPY.voice,
    location: PAINTER_FINAL_COPY.location,
    material: PAINTER_FINAL_COPY.supply,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const supplyChoice = (ctx.extraState.supplyChoice as string) ?? null;
    const scaffoldChoice = (ctx.extraState.scaffoldChoice as string) ?? null;
    const supplyLabel =
      PAINTER_SUPPLY_OPTIONS.find((o) => o.id === supplyChoice)?.label ||
      supplyChoice ||
      "";
    const scaffoldLabel =
      PAINTER_SCAFFOLD_OPTIONS.find((o) => o.id === scaffoldChoice)?.label ||
      scaffoldChoice ||
      "";
    const problem = [
      supplyLabel ? `${PAINTER_FINAL_COPY.supply} ${supplyLabel}` : "",
      scaffoldLabel ? `${PAINTER_FINAL_COPY.scaffold} ${scaffoldLabel}` : "",
      composePainterJob(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: "painter", problem, motoristVehicle: null };
  },
  computeCanSend: ({ finalStep, extraState, photos }) => {
    if (photos.length < PAINTER_MIN_PHOTOS) return false;
    if (finalStep === "material") {
      return (extraState.supplyChoice as string | null) !== null &&
        (extraState.scaffoldChoice as string | null) !== null;
    }
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      supplyChoice: (snap as Record<string, unknown>).supplyChoice ?? null,
      scaffoldChoice: (snap as Record<string, unknown>).scaffoldChoice ?? null,
    });
  },
  collectExtraSnapshot: (state) => ({
    supplyChoice: state.supplyChoice,
    scaffoldChoice: state.scaffoldChoice,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    chipIdle,
    actionFlat,
  }) => {
    if (finalStep !== "material") return null;
    const supplyChoice = (extraState.supplyChoice as string) ?? null;
    const scaffoldChoice = (extraState.scaffoldChoice as string) ?? null;
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
            {PAINTER_FINAL_COPY.supply}
          </p>
          {supplyChoice === null ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {PAINTER_SUPPLY_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" onClick={() => { setExtraState({ ...extraState, supplyChoice: opt.id }); setError(null); }} className={cn("h-11 rounded-md border-0 text-[13px] font-bold active:scale-[0.985]", chipIdle)}>
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={cn("text-[13px] font-bold", ink)}>
                {PAINTER_SUPPLY_OPTIONS.find((o) => o.id === supplyChoice)?.label ?? supplyChoice}
              </span>
              <button type="button" onClick={() => setExtraState({ ...extraState, supplyChoice: null })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
            </div>
          )}
        </div>
        <div>
          <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
            {PAINTER_FINAL_COPY.scaffold}
          </p>
          {scaffoldChoice === null ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {PAINTER_SCAFFOLD_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" onClick={() => { setExtraState({ ...extraState, scaffoldChoice: opt.id }); setError(null); }} className={cn("h-11 rounded-md border-0 text-[13px] font-bold active:scale-[0.985]", chipIdle)}>
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={cn("text-[13px] font-bold", ink)}>
                {PAINTER_SCAFFOLD_OPTIONS.find((o) => o.id === scaffoldChoice)?.label ?? scaffoldChoice}
              </span>
              <button type="button" onClick={() => setExtraState({ ...extraState, scaffoldChoice: null })} className={cn("border-0 text-[13px] font-bold", actionFlat)}>Change</button>
            </div>
          )}
        </div>
      </div>
    );
  },
};

/* ======================================================================== */
/*  Fashion config                                                           */
/* ======================================================================== */

const fashionConfig: HelpFlowConfig = {
  sessionKey: "ona-fashion-flow-session",
  screen: fashionScreen as ScreenFn,
  nextScreen: nextFashionScreen as NextScreenFn,
  canAdvanceText: fashCanAdvance as CanAdvanceTextFn,
  composeProblem: composeFashionProblem as ComposeProblemFn,
  startOptions: FASHION_START_OPTIONS,
  hasVehicleStep: false,
  defaultStack: ["start"],
  defaultTrade: "fashion",
  nearestProServices: ["fashion"],
  urgencyChips: makeUrgencyChips(FASHION_FINAL_COPY),
  maxPhotos: FASHION_MAX_PHOTOS,
  minPhotos: FASHION_MIN_PHOTOS,
  finalSteps: ["urgency", "photos", "voice", "location", "home"],
  finalCopy: {
    urgency: FASHION_FINAL_COPY.urgency,
    photos: FASHION_FINAL_COPY.photos,
    voice: FASHION_FINAL_COPY.voice,
    location: FASHION_FINAL_COPY.location,
    home: FASHION_FINAL_COPY.home,
  },
  progressDefaultTotal: 11,
  sendLabel: "Find a Repair Pro",
  busyLabel: "Finding help",
  buildPayload: (ctx) => {
    const homeChoice = (ctx.extraState.homeChoice as "home" | "visit" | null) ?? null;
    const problem = [
      homeChoice === "home" ? "Will come to your location: Yes" : "",
      composeFashionProblem(ctx.answers, ctx.extra, ctx.landmark),
    ]
      .filter(Boolean)
      .join("\n");
    return { serviceType: "fashion", problem, motoristVehicle: null };
  },
  computeCanSend: ({ finalStep, extraState, photos }) => {
    if (photos.length < FASHION_MIN_PHOTOS) return false;
    if (finalStep === "home") return (extraState.homeChoice as string | null) !== null;
    return true;
  },
  restoreExtraSnapshot: (snap, setExtraState) => {
    setExtraState({
      homeChoice: (snap as Record<string, unknown>).homeChoice ?? null,
    });
  },
  collectExtraSnapshot: (state) => ({
    homeChoice: state.homeChoice,
  }),
  renderExtraFinalStep: ({
    finalStep,
    extraState,
    setExtraState,
    setError,
    ink,
    chipIdle,
  }) => {
    if (finalStep !== "home") return null;
    const homeChoice = (extraState.homeChoice as "home" | "visit" | null) ?? null;
    return (
      <div>
        <p className={cn("text-[13px] font-semibold leading-snug", ink)}>
          {FASHION_FINAL_COPY.home}
        </p>
        {homeChoice === null ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setExtraState({ ...extraState, homeChoice: "home" }); setError(null); }} className={cn("h-11 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>
              I&apos;ll come to you
            </button>
            <button type="button" onClick={() => { setExtraState({ ...extraState, homeChoice: "visit" }); setError(null); }} className={cn("h-11 rounded-md border-0 text-[14px] font-bold active:scale-[0.985]", chipIdle)}>
              Come to my place
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-[13px] font-bold", ink)}>
              {homeChoice === "home" ? "I'll come to you" : "Come to my place"}
            </span>
            <button type="button" onClick={() => setExtraState({ ...extraState, homeChoice: null })} className="border-0 text-[13px] font-bold text-slate-700">Change</button>
          </div>
        )}
      </div>
    );
  },
};

/* ======================================================================== */
/*  Export all configs                                                       */
/* ======================================================================== */

export const helpFlowConfigs: Record<string, HelpFlowConfig> = {
  tow: towConfig,
  mechanic: mechanicConfig,
  battery: batteryConfig,
  body: bodyConfig,
  vulcanizer: vulcanizerConfig,
  ac: acConfig,
  electrical: electricalConfig,
  diagnostics: diagnosticsConfig,
  solar: solarConfig,
  generator: generatorConfig,
  plumber: plumberConfig,
  carpenter: carpenterConfig,
  painter: painterConfig,
  fashion: fashionConfig,
};
