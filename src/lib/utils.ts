import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function kmToMeters(km: number) {
  return km * 1000;
}

export function formatDistance(km: number) {
  if (km < 0.1) return "< 0.1 km";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatEta(minutes: number) {
  if (minutes < 1) return "< 1 min";
  return `${Math.round(minutes)} min`;
}
