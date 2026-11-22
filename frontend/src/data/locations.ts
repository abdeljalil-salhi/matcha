import placeData from "../../../data/places.json";

export interface PlaceRecord {
  city: string;
  area: string | null;
  country_code: string;
  country: string;
  latitude: number;
  longitude: number;
  featured?: boolean;
}

export interface LocationChoice extends PlaceRecord {
  id: string;
  label: string;
  detail: string;
  /** Query strings are intentionally in the form accepted by the backend resolver. */
  query: string;
  kind: "city" | "neighborhood";
  /** Small pixel nudges keep the featured nearby pins individually clickable. */
  mapOffset?: { x: number; y: number };
}

export interface LocationChoiceGroup {
  id: string;
  label: string;
  choices: LocationChoice[];
}

const PLACE_RECORDS = placeData.places as PlaceRecord[];

const slug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "-");

const FEATURED_OFFSETS: Record<string, { x: number; y: number }> = {
  montmartre: { x: -16, y: -14 },
  "latin-quarter": { x: -16, y: 14 },
  "paris-center": { x: 16, y: 0 },
  "croix-rousse": { x: -12, y: -12 },
  "lyon-center": { x: 12, y: 12 },
  "le-panier": { x: -12, y: -12 },
  "marseille-center": { x: 12, y: 12 },
  agdal: { x: -12, y: -12 },
  "rabat-center": { x: 12, y: 12 },
  maarif: { x: -12, y: -12 },
  "casablanca-center": { x: 12, y: 12 },
  soho: { x: -12, y: -12 },
  "london-center": { x: 12, y: 12 },
};

const toChoice = (place: PlaceRecord, index: number): LocationChoice => {
  const key = `${slug(place.city)}-${place.area ? slug(place.area) : "center"}`;
  return {
    ...place,
    id: `${key}-${slug(place.country_code)}-${index}`,
    label: place.area ?? place.city,
    detail: place.area ? `${place.city} · ${place.country_code}` : `City center · ${place.country_code}`,
    query: place.area ? `${place.area}, ${place.city}` : `${place.city}, ${place.country_code}`,
    kind: place.area ? "neighborhood" : "city",
    mapOffset: place.featured ? FEATURED_OFFSETS[key] : undefined,
  };
};

export const LOCATION_CHOICES: LocationChoice[] = PLACE_RECORDS.map(toChoice);

export const FEATURED_CHOICES = LOCATION_CHOICES.filter((choice) => choice.featured);

const byCountry = new Map<string, LocationChoice[]>();
for (const choice of LOCATION_CHOICES) {
  if (choice.featured) continue;
  const list = byCountry.get(choice.country) ?? [];
  list.push(choice);
  byCountry.set(choice.country, list);
}

export const LOCATION_CHOICE_GROUPS: LocationChoiceGroup[] = [
  { id: "featured", label: "Featured places", choices: FEATURED_CHOICES },
  ...[...byCountry.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, choices], index) => ({
      id: `${slug(country)}-${index}`,
      label: country,
      choices: choices.sort((a, b) => a.city.localeCompare(b.city) || a.label.localeCompare(b.label)),
    })),
];

export function searchLocations(value: string, limit = 8): LocationChoice[] {
  const needle = value.trim().toLocaleLowerCase();
  if (!needle) return [];
  const scored = LOCATION_CHOICES.map((choice) => {
    const label = choice.label.toLocaleLowerCase();
    const city = choice.city.toLocaleLowerCase();
    const query = choice.query.toLocaleLowerCase();
    const score = label.startsWith(needle)
      ? 0
      : city.startsWith(needle)
        ? 1
        : label.includes(needle)
          ? 2
          : query.includes(needle)
            ? 3
            : 4;
    return { choice, score };
  }).filter((item) => item.score < 4);
  return scored
    .sort((a, b) => a.score - b.score || a.choice.label.localeCompare(b.choice.label))
    .slice(0, limit)
    .map((item) => item.choice);
}

const haversineKm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const value =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(value));
};

export function nearestLocationWithDistance(
  latitude: number,
  longitude: number,
): { choice: LocationChoice; distanceKm: number } {
  return LOCATION_CHOICES.reduce(
    (closest, choice) => {
      const distanceKm = haversineKm(latitude, longitude, choice.latitude, choice.longitude);
      return distanceKm < closest.distanceKm ? { choice, distanceKm } : closest;
    },
    { choice: LOCATION_CHOICES[0]!, distanceKm: Number.POSITIVE_INFINITY },
  );
}

/** Falls back to the closest supported place when reverse geocoding has no neighborhood. */
export function nearestLocation(latitude: number, longitude: number): LocationChoice {
  return nearestLocationWithDistance(latitude, longitude).choice;
}
