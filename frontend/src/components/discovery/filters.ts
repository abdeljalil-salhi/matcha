import type { DiscoveryFilters, SortDirection, SortKey } from "../../api";

export interface FilterValues {
  location: string;
  min_age: string;
  max_age: string;
  min_fame: string;
  max_fame: string;
  max_distance_km: string;
  min_common_tags: string;
  tags: string[];
  sort: SortKey;
  direction: SortDirection | "";
}

export const EMPTY_FILTERS: FilterValues = {
  location: "",
  min_age: "",
  max_age: "",
  min_fame: "",
  max_fame: "",
  max_distance_km: "",
  min_common_tags: "",
  tags: [],
  sort: "recommended",
  direction: "",
};

const SORT_KEYS = new Set<SortKey>([
  "recommended",
  "location",
  "age",
  "fame",
  "common_tags",
  "newest",
]);

/** Normalize persisted discovery filters, falling back to defaults for invalid values. */
export function sanitizeFilterValues(value: unknown): FilterValues {
  if (!value || typeof value !== "object") return EMPTY_FILTERS;
  const raw = value as Partial<Record<keyof FilterValues, unknown>>;
  const str = (key: keyof FilterValues) =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";
  const sort = SORT_KEYS.has(raw.sort as SortKey) ? (raw.sort as SortKey) : "recommended";
  const direction =
    raw.direction === "asc" || raw.direction === "desc" ? raw.direction : "";
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    location: str("location"),
    min_age: str("min_age"),
    max_age: str("max_age"),
    min_fame: str("min_fame"),
    max_fame: str("max_fame"),
    max_distance_km: str("max_distance_km"),
    min_common_tags: str("min_common_tags"),
    tags,
    sort,
    direction: sort === "recommended" ? "" : direction,
  };
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toApiFilters(values: FilterValues, limit = 25, offset = 0): DiscoveryFilters {
  const filters: DiscoveryFilters = { limit, offset };
  if (values.location.trim()) filters.location = values.location.trim();
  const minAge = numberOrUndefined(values.min_age);
  const maxAge = numberOrUndefined(values.max_age);
  const minFame = numberOrUndefined(values.min_fame);
  const maxFame = numberOrUndefined(values.max_fame);
  const distance = numberOrUndefined(values.max_distance_km);
  const common = numberOrUndefined(values.min_common_tags);
  if (minAge !== undefined) filters.min_age = minAge;
  if (maxAge !== undefined) filters.max_age = maxAge;
  if (minFame !== undefined) filters.min_fame = minFame;
  if (maxFame !== undefined) filters.max_fame = maxFame;
  if (distance !== undefined) filters.max_distance_km = distance;
  if (common !== undefined) filters.min_common_tags = common;
  if (values.tags.length > 0) filters.tag = values.tags;
  if (values.sort) filters.sort = values.sort;
  if (values.direction && values.sort !== "recommended") filters.direction = values.direction;
  return filters;
}
