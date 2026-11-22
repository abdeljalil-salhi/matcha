import os
from http import HTTPStatus
from urllib.parse import urlsplit

from ..common.http import ApiError
from ..common.types import JsonValue
from .transport import fetch_geocode
from .types import GeocoderEndpoint, GeocoderParams


def provider(path: GeocoderEndpoint, params: GeocoderParams) -> JsonValue:
    """Fetch a lookup through the typed provider transport.

    Args:
        path (GeocoderEndpoint): Search or reverse endpoint.
        params (GeocoderParams): Validated provider query parameters.

    Returns:
        JsonValue: Decoded provider response, or None when no provider is set.
    """
    base = os.environ.get("GEOCODER_URL", "").rstrip("/")
    if not base:
        return None
    parsed = urlsplit(base)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE, "Location lookup is unavailable."
        )
    user_agent = os.environ.get("GEOCODER_USER_AGENT", "Matcha/1.0")
    return fetch_geocode(base, path, params, user_agent)
