import { api, ApiError, type ResolvedLocation } from "../api";
import { nearestLocationWithDistance } from "../data/locations";

/**
 * Saves browser-provided coordinates through the GPS endpoint.
 * Some reverse geocoders return a city without a neighborhood, which the API
 * rejects with 422. In that case we save the closest supported offline place
 * through the manual endpoint so the user still gets a usable location.
 */
export async function saveDetectedLocation(
  latitude: number,
  longitude: number,
): Promise<ResolvedLocation> {
  const nearest = nearestLocationWithDistance(latitude, longitude);
  // The offline fixture already resolves this area, so skip a reverse-geocoder
  // round trip that can reject city-only results.
  if (nearest.distanceKm <= 4) {
    return api.profile.setLocation({ source: "manual", query: nearest.choice.query });
  }

  try {
    return await api.profile.setLocation({
      source: "gps",
      latitude,
      longitude,
      consent: true,
    });
  } catch (cause) {
    const status = cause instanceof ApiError ? cause.status : 0;
    const message = cause instanceof Error ? cause.message : "";
    if (status === 422 || /neighborhood|location not found/i.test(message)) {
      return api.profile.setLocation({ source: "manual", query: nearest.choice.query });
    }
    throw cause;
  }
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
