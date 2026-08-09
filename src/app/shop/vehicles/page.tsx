"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Check, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  writeSessionVehicle,
  type ActiveVehicle,
} from "@/components/shop/shop-vehicle-bar";
import { authFetch } from "@/lib/api-auth-headers";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type Make = { id: string; name: string; slug: string };
type Model = { id: string; name: string; slug: string };
type GarageV = ActiveVehicle & { id: string; isDefault?: boolean };

export default function ShopVehiclesPage() {
  const { theme, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const [garage, setGarage] = useState<GarageV[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight ? "bg-white/90 text-slate-900" : "bg-[#1c1c1e] text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";

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
      const res = await fetch("/api/shop/vehicles/catalog?level=makes");
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { makes?: Make[] };
      };
      if (json.ok) setMakes(json.data?.makes ?? []);
    })();
    void loadGarage();
  }, [loadGarage]);

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

  const useVehicle = async (save: boolean) => {
    if (!makeName || !modelName) {
      setMsg("Pick make and model");
      return;
    }
    const v: ActiveVehicle = {
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
      `/shop/c/mechanic?allParts=1&makeName=${encodeURIComponent(makeName)}&modelName=${encodeURIComponent(modelName)}${v.year ? `&year=${v.year}` : ""}&makeId=${makeId}&modelId=${modelId}`
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
          Pick your vehicle to browse ALL PARTS with fitment. Free catalog from
          public vehicle data + Ona products (NGN).
        </p>

        {!isAuthenticated ? (
          <p className={cn("mb-3 rounded-xl px-3 py-2 text-[12px]", card)}>
            Sign in to save vehicles to your garage. You can still browse with a
            temporary selection.
          </p>
        ) : null}

        <div className={cn("rounded-2xl p-3", card)}>
          <p className="text-[13px] font-black">Select vehicle</p>
          <div className="mt-2 flex flex-col gap-2">
            <select
              className={cn(
                "h-11 w-full rounded-xl border-0 px-3 text-[13px] font-semibold outline-none",
                isLight ? "bg-black/5" : "bg-white/10"
              )}
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
            <select
              className={cn(
                "h-11 w-full rounded-xl border-0 px-3 text-[13px] font-semibold outline-none",
                isLight ? "bg-black/5" : "bg-white/10"
              )}
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
            <select
              className={cn(
                "h-11 w-full rounded-xl border-0 px-3 text-[13px] font-semibold outline-none",
                isLight ? "bg-black/5" : "bg-white/10"
              )}
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
          </div>
          {msg ? (
            <p className="mt-2 text-[12px] font-semibold text-red-500">{msg}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || !makeId || !modelId}
              onClick={() => void useVehicle(false)}
              className="h-11 flex-1 rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white disabled:opacity-50"
            >
              Browse ALL PARTS
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                disabled={busy || !makeId || !modelId}
                onClick={() => void useVehicle(true)}
                className={cn(
                  "h-11 flex-1 rounded-xl border-0 text-[13px] font-bold disabled:opacity-50",
                  isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white"
                )}
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
                    "flex items-center gap-2 rounded-xl px-3 py-2.5",
                    card
                  )}
                >
                  <Car className="h-4 w-4 shrink-0 text-[#FF6B35]" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 border-0 bg-transparent text-left"
                    onClick={() => {
                      writeSessionVehicle(v);
                      router.push(
                        `/shop/c/mechanic?allParts=1&makeName=${encodeURIComponent(v.makeName)}&modelName=${encodeURIComponent(v.modelName)}${v.year ? `&year=${v.year}` : ""}`
                      );
                    }}
                  >
                    <p className="text-[13px] font-bold">
                      {[v.year, v.makeName, v.modelName].filter(Boolean).join(" ")}
                    </p>
                    {v.isDefault ? (
                      <p className="text-[10px] font-semibold text-emerald-600">
                        Active
                      </p>
                    ) : null}
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
