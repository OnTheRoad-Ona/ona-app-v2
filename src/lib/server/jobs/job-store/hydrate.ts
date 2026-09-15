import type { JobRecord } from "@/lib/jobs/types";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";

export async function hydrateMotoristPhoto(job: JobRecord): Promise<JobRecord> {
  if (job.motoristPhoto?.trim()) return job;
  if (!isSupabaseAdminConfigured() || !job.motoristId) return job;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("profiles")
      .select("avatar_url")
      .eq("id", job.motoristId)
      .maybeSingle();
    if (data?.avatar_url) {
      return { ...job, motoristPhoto: String(data.avatar_url) };
    }
  } catch {
    /* optional */
  }
  return job;
}

export async function hydrateMotoristVehicle(job: JobRecord): Promise<JobRecord> {
  if (job.motoristVehicle?.trim() || !job.motoristId) return job;
  if (!isSupabaseAdminConfigured()) return job;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("motorist_profiles")
      .select("vehicle_make, vehicle_model, vehicle_year, vehicles")
      .eq("user_id", job.motoristId)
      .maybeSingle();
    if (!data) return job;
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
    const first =
      vehicles.find(
        (v: { make?: string; model?: string }) => v && (v.make || v.model),
      ) || null;
    let label = "";
    if (first && typeof first === "object") {
      const f = first as {
        vehicleType?: string;
        make?: string;
        model?: string;
        year?: string;
      };
      label = [f.vehicleType, f.make, f.model, f.year]
        .filter((x) => x && String(x).trim() && String(x) !== "Any")
        .join(" ");
    }
    if (!label) {
      label = [data.vehicle_make, data.vehicle_model, data.vehicle_year]
        .filter((x) => x && String(x).trim())
        .join(" ");
    }
    if (!label.trim()) return job;
    return { ...job, motoristVehicle: label.trim() };
  } catch {
    return job;
  }
}

export async function hydrateJobPhones(job: JobRecord): Promise<JobRecord> {
  if (!isSupabaseAdminConfigured()) return job;
  const needPhones = !job.motoristPhone?.trim() || !job.repairProPhone?.trim();
  if (!needPhones && job.motoristVehicle?.trim()) return job;
  try {
    const sb = createServiceSupabase();
    const ids = [job.motoristId, job.repairProId].filter(Boolean);
    if (!ids.length) return job;
    const { data } = await sb
      .from("profiles")
      .select("id, phone, avatar_url, full_name")
      .in("id", ids);
    let next = { ...job };
    if (data?.length) {
      for (const row of data as {
        id: string;
        phone?: string | null;
        avatar_url?: string | null;
        full_name?: string | null;
      }[]) {
        const phone = (row.phone || "").trim() || null;
        if (row.id === job.motoristId) {
          next = {
            ...next,
            motoristPhone: next.motoristPhone || phone,
            motoristPhoto:
              next.motoristPhoto ||
              (row.avatar_url ? String(row.avatar_url) : null),
            motoristName:
              next.motoristName && next.motoristName !== "Customer"
                ? next.motoristName
                : String(row.full_name || next.motoristName || "Customer"),
          };
        }
        if (row.id === job.repairProId) {
          next = {
            ...next,
            repairProPhone: next.repairProPhone || phone,
            repairProPhoto:
              next.repairProPhoto ||
              (row.avatar_url ? String(row.avatar_url) : undefined),
            repairProName:
              next.repairProName && next.repairProName !== "Repair Pro"
                ? next.repairProName
                : String(row.full_name || next.repairProName || "Repair Pro"),
          };
        }
      }
    }
    if (!next.motoristVehicle?.trim() && job.motoristId) {
      next = await hydrateMotoristVehicle(next);
    }
    return next;
  } catch {
    return job;
  }
}

export async function hydrateJobContacts(job: JobRecord): Promise<JobRecord> {
  if (!isSupabaseAdminConfigured() || !job.motoristId) return job;
  const needProfiles =
    !job.motoristPhone?.trim() ||
    !job.repairProPhone?.trim() ||
    !job.motoristPhoto?.trim();
  const needVehicle = !job.motoristVehicle?.trim();
  const ids = [job.motoristId, job.repairProId].filter(Boolean);
  if ((!needProfiles || !ids.length) && !needVehicle) return job;
  try {
    const sb = createServiceSupabase();
    const [profilesRes, vehicleRes] = await Promise.all([
      needProfiles && ids.length
        ? sb
            .from("profiles")
            .select("id, phone, avatar_url, full_name")
            .in("id", ids)
        : Promise.resolve({ data: null } as { data: unknown }),
      needVehicle
        ? sb
            .from("motorist_profiles")
            .select("vehicle_make, vehicle_model, vehicle_year, vehicles")
            .eq("user_id", job.motoristId)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: unknown }),
    ]);
    let next = { ...job };
    const rows = profilesRes.data as
      | {
          id: string;
          phone?: string | null;
          avatar_url?: string | null;
          full_name?: string | null;
        }[]
      | null;
    if (rows?.length) {
      for (const row of rows) {
        const phone = (row.phone || "").trim() || null;
        if (row.id === job.motoristId) {
          next = {
            ...next,
            motoristPhone: next.motoristPhone || phone,
            motoristPhoto:
              next.motoristPhoto ||
              (row.avatar_url ? String(row.avatar_url) : null),
            motoristName:
              next.motoristName && next.motoristName !== "Customer"
                ? next.motoristName
                : String(row.full_name || next.motoristName || "Customer"),
          };
        }
        if (row.id === job.repairProId) {
          next = {
            ...next,
            repairProPhone: next.repairProPhone || phone,
            repairProPhoto:
              next.repairProPhoto ||
              (row.avatar_url ? String(row.avatar_url) : undefined),
            repairProName:
              next.repairProName && next.repairProName !== "Repair Pro"
                ? next.repairProName
                : String(row.full_name || next.repairProName || "Repair Pro"),
          };
        }
      }
    }
    const vdata = vehicleRes.data as
      | {
          vehicle_make?: string | null;
          vehicle_model?: string | null;
          vehicle_year?: string | null;
          vehicles?: unknown;
        }
      | null;
    if (vdata && !next.motoristVehicle?.trim()) {
      const vehicles = Array.isArray(vdata.vehicles) ? vdata.vehicles : [];
      const first =
        vehicles.find(
          (v: { make?: string; model?: string }) => v && (v.make || v.model),
        ) || null;
      let label = "";
      if (first && typeof first === "object") {
        const f = first as {
          vehicleType?: string;
          make?: string;
          model?: string;
          year?: string;
        };
        label = [f.vehicleType, f.make, f.model, f.year]
          .filter((x) => x && String(x).trim() && String(x) !== "Any")
          .join(" ");
      }
      if (!label) {
        label = [
          vdata.vehicle_make,
          vdata.vehicle_model,
          vdata.vehicle_year,
        ]
          .filter((x) => x && String(x).trim())
          .join(" ");
      }
      if (label.trim()) next = { ...next, motoristVehicle: label.trim() };
    }
    return next;
  } catch {
    return job;
  }
}

export async function hydrateJobCallout(job: JobRecord): Promise<JobRecord> {
  if (job.agreedMajor == null) return job;
  try {
    const { resolveJobCalloutQuote } =
      await import("@/lib/server/callout/resolve");
    const q = await resolveJobCalloutQuote(job);
    if (q) {
      return { ...job, calloutQuote: q, callout_quote: q };
    }
  } catch {
    /* keep job without quote */
  }
  return job;
}
