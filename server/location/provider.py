import json
import os
from collections.abc import Mapping
from http import HTTPStatus
from urllib.error import URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from ..common.http import ApiError
from ..common.types import JsonValue
from ..common.validation import coordinate
from .limits import MAX_LATITUDE_DEGREES, MAX_LONGITUDE_DEGREES
from .types import Place

GEOCODER_TIMEOUT_SECONDS = 4
MAX_GEOCODER_PLACE_LABEL_LENGTH = 120
MAX_GEOCODER_RESPONSE_BYTES = 512 * 1024


def provider(path: str, params: Mapping[str, str | int | float]) -> JsonValue:
    """Fetch JSON from the configured geocoder.

    Args:
        path (str): Endpoint suffix.
        params (Mapping[str, str | int | float]): URL query parameters.

    Returns:
        JsonValue: Decoded JSON, or None if no provider is configured.
    """
    base = os.environ.get("GEOCODER_URL", "").rstrip("/")
    if not base:
        return None
    if urlsplit(base).scheme not in {"http", "https"}:
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE, "Location lookup is unavailable."
        )
    headers = {"User-Agent": os.environ.get("GEOCODER_USER_AGENT", "Matcha/1.0")}
    try:
        with urlopen(
            Request(f"{base}/{path}?{urlencode(params)}", headers=headers),
            timeout=GEOCODER_TIMEOUT_SECONDS,
        ) as response:
            payload = response.read(MAX_GEOCODER_RESPONSE_BYTES + 1)
        if len(payload) > MAX_GEOCODER_RESPONSE_BYTES:
            raise ValueError
        return json.loads(payload)
    except (URLError, TimeoutError, OSError, ValueError):
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE,
            "Location lookup is unavailable. Try again later.",
        ) from None


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
