/**
 * Browse categories on home.
 * Core pro trades stay mechanic | vulcanizer | towing;
 * extra filters map via specialty keywords.
 */
export type ServiceCategory =
  | "mechanic"
  | "vulcanizer"
  | "towing"
  | "battery"
  | "ac"
  | "body"
  | "electrical"
  | "diagnostics"
  | "wash"
  | "all";

/** Services a professional can register / offer */
export type ProService = "mechanic" | "vulcanizer" | "towing" | "wash";

/**
 * What the user registered as.
 * Determines the first screen on app open.
 * Pros can still add more services later.
 */
export type RegisteredAs = "client" | ProService;

/** Current session view: client discovery vs professional tools */
export type UserMode = "client" | "professional";

/** Account type chosen on login / sign-up */
export type AccountType = "motorist" | "professional";

export type AvailabilityStatus =
  | "available"
  | "busy"
  | "nearby"
  | "offline";

export type RequestStatus =
  | "pending"
  | "accepted"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Technician {
  id: string;
  name: string;
  shortName: string;
  serviceType: ProService;
  roleLabel: string;
  photo: string;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  etaMinutes: number;
  status: AvailabilityStatus;
  verified: boolean;
  fastResponse: boolean;
  specialties: string[];
  description: string;
  phone: string;
  serviceRadiusKm: number;
  location: Coordinates;
  markerLabel?: string;
  responseSpeedScore: number;
  currentLoad: number;
}

export interface ServiceRequest {
  id: string;
  technicianId: string;
  technicianName: string;
  serviceType: ProService;
  problem: string;
  status: RequestStatus;
  createdAt: string;
  etaMinutes: number;
  distanceKm: number;
  locationLabel: string;
}

export interface Booking {
  id: string;
  technicianName: string;
  serviceType: ProService;
  date: string;
  time: string;
  status: "upcoming" | "completed" | "cancelled";
  locationLabel: string;
}

export interface MessageThread {
  id: string;
  technicianName: string;
  serviceType: ProService;
  lastMessage: string;
  time: string;
  unread: number;
  photo: string;
}

export interface AppFilters {
  nearest: boolean;
  rating45: boolean;
  availableNow: boolean;
  verified: boolean;
  fastResponse: boolean;
}

export interface UserLocation {
  label: string;
  city: string;
  coordinates: Coordinates;
}
