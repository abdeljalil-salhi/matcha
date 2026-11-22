from http import HTTPStatus

from ..common.http import ApiError
from ..common.types import JsonObject, JsonValue
from ..common.validation import coordinate
from .limits import (
    LOCATION_DECIMAL_PLACES,
    MAX_GEOCODER_PLACE_LABEL_LENGTH,
    MAX_LATITUDE_DEGREES,
    MAX_LONGITUDE_DEGREES,
)
from .types import GeocoderEndpoint, Place


def from_result(result: JsonValue) -> Place | None:
    """Extract a city, area, and valid coordinates from a geocoder result.

    Args:
        result (JsonValue): One decoded geocoder result.

    Returns:
        Place | None: City, area, country code, latitude, and longitude.
    """
    if not isinstance(result, dict):
        return None
    address = result.get("address")
    if not isinstance(address, dict):
        return None
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
    )
    area = (
        address.get("neighbourhood")
        or address.get("suburb")
        or address.get("city_district")
        or address.get("quarter")
    )
    country = address.get("country_code")
    if not isinstance(city, str) or not isinstance(country, str) or len(country) != 2:
        return None
    if area is not None and not isinstance(area, str):
        return None
    try:
        lat_value, lon_value = result["lat"], result["lon"]
        if not isinstance(lat_value, (str, int, float)):
            return None
        if not isinstance(lon_value, (str, int, float)):
            return None
        lat = coordinate(float(lat_value), "latitude", MAX_LATITUDE_DEGREES)
        lon = coordinate(float(lon_value), "longitude", MAX_LONGITUDE_DEGREES)
    except (KeyError, ValueError, TypeError, ApiError):
        return None
    return (
        city[:MAX_GEOCODER_PLACE_LABEL_LENGTH],
        area[:MAX_GEOCODER_PLACE_LABEL_LENGTH] if area else None,
        country.upper(),
        lat,
        lon,
    )


def normalized_place(result: JsonValue) -> JsonObject | None:
    """Keep only supported place fields and rounded provider coordinates.

    Args:
        result (JsonValue): Raw provider response for one place.

    Returns:
        JsonObject | None: Minimal Nominatim-compatible place, or no usable place.
    """
    place = from_result(result)
    if place is None:
        return None
    city, area, country, lat, lon = place
    return {
        "address": {"city": city, "neighbourhood": area, "country_code": country},
        "lat": round(lat, LOCATION_DECIMAL_PLACES),
        "lon": round(lon, LOCATION_DECIMAL_PLACES),
    }


def normalized_response(path: GeocoderEndpoint, raw: JsonValue) -> JsonValue:
    """Discard provider metadata while retaining city-only results for confirmation.

    Args:
        path (GeocoderEndpoint): Search or reverse endpoint.
        raw (JsonValue): Decoded external response.

    Returns:
        JsonValue: Minimal place data; an empty list or None denotes not found.
    """
    if path == "search":
        if not isinstance(raw, list):
            raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, "Invalid location response.")
        return [place for item in raw if (place := normalized_place(item)) is not None]
    if raw is None or (isinstance(raw, dict) and "error" in raw):
        return None
    place = normalized_place(raw)
    if place is None:
        raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, "Invalid location response.")
    return place
