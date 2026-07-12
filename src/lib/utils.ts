import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function milesToKm(miles: number) {
  return miles * 1.60934;
}

export function formatDistance(miles: number) {
  if (miles < 0.1) return "< 0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

export function formatEta(minutes: number) {
  if (minutes < 1) return "< 1 min";
  return `${Math.round(minutes)} min`;
}
