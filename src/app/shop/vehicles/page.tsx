"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Check, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  writeSessionVehicle,
  type ActiveVehicle,
} from "@/components/shop/shop-vehicle-bar";
import { authFetch } from "@/lib/api-auth-headers";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type VehicleType = { slug: string; name: string };
type Make = { id: string; name: string; slug: string };
type Model = { id: string; name: string; slug: string };
type GarageV = ActiveVehicle & { id: string; isDefault?: boolean };

const TYPE_LABELS: Record<string, string> = {
  automobile: "Automobile",
  motorcycle: "Motorcycle",
  truck: "Truck",
  van: "Van",
  bus: "Bus",
  trailer: "Trailer",
  motorhome: "Motorhome / RV",
  atv_utv: "ATV / UTV",
  construction_ag: "Construction & Ag",
  other: "Other",
};

function typeName(slug: string): string {
  return TYPE_LABELS[slug] || "Automobile";
}

export default function ShopVehiclesPage() {
  const { theme, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const [garage, setGarage] = useState<GarageV[]>([]);
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [typeSlug, setTypeSlug] = useState("automobile");
  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const muted = isLight ? "text-slate-600" : "text-white/55";
  const chevronClass = isLight ? "text-slate-500" : "text-white/70";

  const loadGarage = useCallback(async () => {
    if (!isAuthenticated) return;
    const res = await authFetch("/api/shop/vehicles");
    const json = (await res.json()) as {
      ok?: boolean;
      data?: { vehicles?: GarageV[] };
    };
    if (json.ok) setGarage(json.data?.vehicles ?? []);
  }, [isAuthenticated]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/shop/vehicles/catalog?level=types");
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { types?: VehicleType[] };
      };
      if (json.ok && json.data?.types?.length) setTypes(json.data.types);
    })();
    void loadGarage();
  }, [loadGarage]);

  useEffect(() => {
    setMakes([]);
    setModels([]);
    setModelId("");
    setYears([]);
    setYear("");
    setMakeId("");
    void (async () => {
      const res = await fetch(
        `/api/shop/vehicles/catalog?level=makes&type=${encodeURIComponent(typeSlug)}`
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { makes?: Make[] };
      };
      if (json.ok) setMakes(json.data?.makes ?? []);
    })();
  }, [typeSlug]);

  useEffect(() => {
    if (!makeId) {
      setModels([]);
      setModelId("");
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/shop/vehicles/catalog?level=models&makeId=${encodeURIComponent(makeId)}`
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { models?: Model[] };
      };
      if (json.ok) setModels(json.data?.models ?? []);
    })();
  }, [makeId]);

  useEffect(() => {
    if (!modelId) {
      setYears([]);
      setYear("");
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/shop/vehicles/catalog?level=years&modelId=${encodeURIComponent(modelId)}`
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { years?: number[] };
      };
      if (json.ok) setYears(json.data?.years ?? []);
    })();
  }, [modelId]);

  const makeName = makes.find((m) => m.id === makeId)?.name || "";
  const modelName = models.find((m) => m.id === modelId)?.name || "";

  const applyVehicle = async (save: boolean) => {
    if (!makeName || !modelName) {
      setMsg("Pick make and model");
      return;
    }
    const v: ActiveVehicle = {
      vehicleTypeSlug: typeSlug,
      makeId: makeId || null,
      modelId: modelId || null,
      makeName,
      modelName,
      year: year === "" ? null : Number(year),
    };
    writeSessionVehicle(v);
    if (save && isAuthenticated) {
      setBusy(true);
      setMsg(null);
      const res = await authFetch("/api/shop/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleTypeSlug: typeSlug,
          makeId,
          modelId,
          makeName,
          modelName,
          year: v.year,
          setDefault: true,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      setBusy(false);
      if (!json.ok) {
        setMsg(json.error?.message || "Could not save");
        return;
      }
      await loadGarage();
    }
    router.push(
      `/shop/c/mechanic?allParts=1&makeName=${encodeURIComponent(makeName)}&modelName=${encodeURIComponent(modelName)}${v.year ? `&year=${v.year}` : ""}&makeId=${makeId}&modelId=${modelId}&vehicleType=${encodeURIComponent(typeSlug)}`
    );
  };

  const setDefault = async (id: string) => {
    await authFetch("/api/shop/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_default", vehicleId: id }),
    });
    const g = garage.find((x) => x.id === id);
    if (g) writeSessionVehicle(g);
    await loadGarage();
  };

  const remove = async (id: string) => {
    await authFetch("/api/shop/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", vehicleId: id }),
    });
    await loadGarage();
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader title="My vehicles" backHref="/shop" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-2">
        <p className={cn("mb-3 text-[12px] leading-relaxed", muted)}>
          Pick your vehicle to browse ALL PARTS.
        </p>

        {!isAuthenticated ? (
          <p
            className={cn(
              "mb-3 rounded-md border-0 px-3 py-2 text-[12px]",
              isLight ? "text-slate-700" : "text-white/70"
            )}
          >
            Sign in to save vehicles to your garage. You can still browse with a
            temporary selection.
          </p>
        ) : null}

        <div className="border-0 p-0 shadow-none ring-0">
          <p
            className={cn(
              "text-[13px] font-black",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Select vehicle
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <div className="om-flat-select-wrap">
              <select
                className="om-flat-select"
                value={typeSlug}
                onChange={(e) => setTypeSlug(e.target.value)}
              >
                {(types.length
                  ? types
                  : [
                      { slug: "automobile", name: "Automobile" },
                      { slug: "truck", name: "Truck" },
                      { slug: "trailer", name: "Trailer" },
                      { slug: "motorcycle", name: "Motorcycle" },
                      { slug: "motorhome", name: "Motorhome / RV" },
                    ]
                ).map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className={cn("om-flat-select-chevron", chevronClass)}
                strokeWidth={2.5}
                aria-hidden
              />
            </div>
            <div className="om-flat-select-wrap">
              <select
                className="om-flat-select"
                value={makeId}
                onChange={(e) => setMakeId(e.target.value)}
              >
                <option value="">Make</option>
                {makes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className={cn("om-flat-select-chevron", chevronClass)}
                strokeWidth={2.5}
                aria-hidden
              />
            </div>
            <div className="om-flat-select-wrap">
              <select
                className="om-flat-select"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={!makeId}
              >
                <option value="">Model</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className={cn("om-flat-select-chevron", chevronClass)}
                strokeWidth={2.5}
                aria-hidden
              />
            </div>
            <div className="om-flat-select-wrap">
              <select
                className="om-flat-select"
                value={year === "" ? "" : String(year)}
                onChange={(e) =>
                  setYear(e.target.value ? Number(e.target.value) : "")
                }
                disabled={!modelId}
              >
                <option value="">Year (optional)</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown
                className={cn("om-flat-select-chevron", chevronClass)}
                strokeWidth={2.5}
                aria-hidden
              />
            </div>
          </div>
          {msg ? (
            <p className="mt-2 text-[12px] font-semibold text-red-500">{msg}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || !makeId || !modelId}
              onClick={() => void applyVehicle(false)}
              className="h-11 flex-1 rounded-md border-0 bg-[#FF6B35] text-[13px] font-bold text-white shadow-none outline-none ring-0 disabled:opacity-50"
              style={{
                backgroundColor: "#FF6B35",
                backgroundImage: "none",
                border: "none",
                boxShadow: "none",
              }}
            >
              Browse ALL PARTS
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                disabled={busy || !makeId || !modelId}
                onClick={() => void applyVehicle(true)}
                className={cn(
                  "h-11 flex-1 rounded-md border-0 text-[13px] font-bold shadow-none outline-none ring-0 disabled:opacity-50",
                  isLight ? "text-slate-900" : "text-white"
                )}
                style={{
                  backgroundColor: isLight ? "#d8d9dd" : "#3a3a3c",
                  backgroundImage: "none",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save & browse"}
              </button>
            ) : null}
          </div>
        </div>

        {isAuthenticated && garage.length > 0 ? (
          <>
            <p className="mt-5 mb-2 text-[13px] font-black">Saved garage</p>
            <div className="flex flex-col gap-1.5">
              {garage.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border-0 px-3 py-2.5 shadow-none ring-0",
                    isLight ? "bg-[#f0f0f2] text-slate-900" : "bg-[#2c2c2e] text-white"
                  )}
                >
                  <Car className="h-4 w-4 shrink-0 text-[#FF6B35]" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 border-0 bg-transparent text-left"
                    onClick={() => {
                      writeSessionVehicle(v);
                      router.push(
                        `/shop/c/mechanic?allParts=1&makeName=${encodeURIComponent(v.makeName)}&modelName=${encodeURIComponent(v.modelName)}${v.year ? `&year=${v.year}` : ""}${v.vehicleTypeSlug ? `&vehicleType=${encodeURIComponent(v.vehicleTypeSlug)}` : ""}`
                      );
                    }}
                  >
                    <p className="text-[13px] font-bold">
                      {[v.year, v.makeName, v.modelName].filter(Boolean).join(" ")}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold text-[#FF6B35]">
                      {v.vehicleTypeSlug
                        ? typeName(v.vehicleTypeSlug)
                        : "Automobile"}
                      {v.isDefault ? " · Active" : null}
                    </p>
                  </button>
                  <button
                    type="button"
                    title="Set active"
                    onClick={() => void setDefault(v.id)}
                    className="rounded-lg border-0 bg-transparent p-1.5 text-[#FF6B35]"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => void remove(v.id)}
                    className={cn(
                      "rounded-lg border-0 bg-transparent p-1.5",
                      muted
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
