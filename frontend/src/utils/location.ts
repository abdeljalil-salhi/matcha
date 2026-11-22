import type { CityLocationSuggestion } from "../api/types";
import { api, ApiError, type ResolvedLocation } from "../api";

/**
 * Saves browser-provided coordinates through the GPS endpoint.
 * A failed lookup leaves the saved location unchanged. The location form lets
 * the user choose a manual location instead of guessing one on their behalf.
 */
export async function saveDetectedLocation(
  latitude: number,
  longitude: number,
): Promise<ResolvedLocation> {
  try {
    return await api.profile.setLocation({ source: "gps", latitude, longitude, consent: true });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) {
      const payload = cause.payload;
      if (payload && typeof payload === "object" && "error" in payload &&
          payload.error && typeof payload.error === "object" && "code" in payload.error &&
          payload.error.code === "city_confirmation_required" && "city_suggestion" in payload) {
        const suggestion = payload.city_suggestion;
        if (suggestion && typeof suggestion === "object" &&
            "city" in suggestion && typeof suggestion.city === "string" &&
            "country_code" in suggestion && typeof suggestion.country_code === "string" &&
            "confirmation_token" in suggestion && typeof suggestion.confirmation_token === "string") {
          throw new CityConfirmationRequired({
            city: suggestion.city, country_code: suggestion.country_code,
            confirmation_token: suggestion.confirmation_token,
          });
        }
      }
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

/** A city suggestion requires an explicit manual save; constructing this never saves it. */
export class CityConfirmationRequired extends Error {
  constructor(readonly suggestion: CityLocationSuggestion) {
    super("Confirm the city as your approximate location.");
    this.name = "CityConfirmationRequired";
  }
}
