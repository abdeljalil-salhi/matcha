import { api, type ResolvedLocation } from "../api";

/**
 * Saves browser-provided coordinates through the GPS endpoint.
 * A failed lookup leaves the saved location unchanged. The location form lets
 * the user choose a manual location instead of guessing one on their behalf.
 */
export async function saveDetectedLocation(
  latitude: number,
  longitude: number,
): Promise<ResolvedLocation> {
  return api.profile.setLocation({ source: "gps", latitude, longitude, consent: true });
}

export async function lookupNetworkLocation(): Promise<{ latitude: number; longitude: number; label: string }> {
  const response = await fetch("https://ipwho.is/");
  if (!response.ok) throw new Error("The location service is unavailable.");
  const data = (await response.json()) as {
    success?: boolean;
    latitude?: number;
    longitude?: number;
    city?: string;
    country?: string;
    message?: string;
  };
  if (data.success === false || typeof data.latitude !== "number" || typeof data.longitude !== "number") {
    throw new Error(data.message ?? "No approximate location was returned.");
  }
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    label: [data.city, data.country].filter(Boolean).join(", ") || "Approximate network location",
  };
}
