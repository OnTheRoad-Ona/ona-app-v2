export type ServiceCategory = "mechanic" | "vulcanizer" | "towing" | "all";

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
  serviceType: Exclude<ServiceCategory, "all">;
  roleLabel: string;
  photo: string;
  rating: number;
  reviewCount: number;
  distanceMiles: number;
  etaMinutes: number;
  status: AvailabilityStatus;
  verified: boolean;
  fastResponse: boolean;
  specialties: string[];
  description: string;
  phone: string;
  serviceRadiusMiles: number;
  location: Coordinates;
  markerLabel?: string;
  responseSpeedScore: number;
  currentLoad: number;
}

export interface ServiceRequest {
  id: string;
  technicianId: string;
  technicianName: string;
  serviceType: Exclude<ServiceCategory, "all">;
  problem: string;
  status: RequestStatus;
  createdAt: string;
  etaMinutes: number;
  distanceMiles: number;
  locationLabel: string;
}

export interface Booking {
  id: string;
  technicianName: string;
  serviceType: Exclude<ServiceCategory, "all">;
  date: string;
  time: string;
  status: "upcoming" | "completed" | "cancelled";
  locationLabel: string;
}

export interface MessageThread {
  id: string;
  technicianName: string;
  serviceType: Exclude<ServiceCategory, "all">;
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
