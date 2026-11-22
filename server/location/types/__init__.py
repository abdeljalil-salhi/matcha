from typing import Literal, TypedDict
from collections.abc import Mapping

from ...common.types import JsonValue

type Coordinate = int | float
type Place = tuple[str, str | None, str, float, float]
type LocationSource = Literal["manual", "gps"]
type GeocoderEndpoint = Literal["search", "reverse"]
type GeocoderParams = Mapping[str, str | int | float]


class CachedGeocode(TypedDict):
    """Cached JSON payload; a stored null represents a negative lookup."""

    payload: JsonValue


class SavedLocation(TypedDict):
    """Public result of saving a location."""

    city: str
    area: str | None
    country_code: str
    location_source: LocationSource
