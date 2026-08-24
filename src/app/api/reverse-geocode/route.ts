import { NextRequest, NextResponse } from "next/server";
import { reverseGeocodeLatLngServer } from "@/lib/google-maps";

/**
 * Server-side reverse geocode (Google → Nominatim).
 * Avoids browser CORS / User-Agent limits on Nominatim.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required numbers" },
      { status: 400 },
    );
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json(
      { error: "lat/lng out of range" },
      { status: 400 },
    );
  }

  const result = await reverseGeocodeLatLngServer(lat, lng);
  if (!result) {
    return NextResponse.json({ error: "No address found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
