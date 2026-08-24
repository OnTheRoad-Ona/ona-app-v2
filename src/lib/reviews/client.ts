import type { ProReview, ProReviewStats } from "@/lib/reviews/types";

const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  url: string,
  opts?: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; message: string };

async function parse<T>(res: Response): Promise<ApiOk<T> | ApiErr> {
  if (!res.ok) {
    try {
      const json = await res.json();
      return {
        ok: false,
        message: json?.error || json?.message || res.statusText,
      };
    } catch {
      return { ok: false, message: res.statusText };
    }
  }
  const json = await res.json();
  if (!json || json?.ok === false) {
    return {
      ok: false,
      message: json?.error || json?.message || "Request failed",
    };
  }
  return { ok: true, data: json.data as T };
}

export async function apiCreateReview(input: {
  jobId: string;
  repairProId: string;
  rating: number;
  comment?: string;
  photos?: string[];
}) {
  const res = await fetchWithTimeout("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse<{ review: ProReview }>(res);
}

export async function apiGetProReviews(proId: string): Promise<ProReview[]> {
  const res = await fetchWithTimeout(
    `/api/reviews?proId=${encodeURIComponent(proId)}`,
  );
  const json = await parse<{ reviews: ProReview[] }>(res);
  return json.ok ? json.data.reviews : [];
}

export async function apiGetProReviewStats(
  proId: string,
): Promise<ProReviewStats | null> {
  const res = await fetchWithTimeout(
    `/api/reviews/stats?proId=${encodeURIComponent(proId)}`,
  );
  const json = await parse<{ stats: ProReviewStats }>(res);
  return json.ok ? json.data.stats : null;
}
