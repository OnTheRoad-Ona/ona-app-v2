"use client";

import { ServiceAreaPicker } from "@/components/artisan/service-area-picker";
import { ARTISAN_STEP_KEY } from "@/lib/geo/service-area";
import { useEffect } from "react";

export default function ArtisanServiceCitiesPage() {
  useEffect(() => {
    try {
      sessionStorage.setItem(ARTISAN_STEP_KEY, "essentials");
    } catch {
      /* */
    }
  }, []);
  return <ServiceAreaPicker mode="cities" />;
}
