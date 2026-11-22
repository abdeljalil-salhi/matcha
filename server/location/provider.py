import os
from http import HTTPStatus
from urllib.parse import urlsplit

from flask import current_app

from ..common.http import ApiError
from ..common.types import JsonValue
from .cache import cache_key, read_cached, write_cached
from .results import normalized_response
from .throttle import finish_request, provider_lock, reserve_request
from .transport import fetch_geocode
from .types import GeocoderEndpoint, GeocoderParams


def provider(path: GeocoderEndpoint, params: GeocoderParams) -> JsonValue:
    """Resolve a lookup through a shared cache and serialized provider connection.

    Args:
        path (GeocoderEndpoint): Search or reverse endpoint.
        params (GeocoderParams): Validated provider query parameters.

    Returns:
        JsonValue: Normalized, cached response, or None when no provider is set.
    """
    base = os.environ.get("GEOCODER_URL", "").rstrip("/")
    if not base:
        return None
    parsed = urlsplit(base)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE, "Location lookup is unavailable."
        )
    host = parsed.hostname.lower()
    key = cache_key(base, path, params)
    user_agent = os.environ.get("GEOCODER_USER_AGENT", "Matcha/1.0")
    with current_app.extensions["db"].connection() as connection:
        cached = read_cached(connection, key)
        if cached is not None:
            return cached["payload"]
        with provider_lock(connection, host):
            # A different worker may have filled this result while we waited.
            cached = read_cached(connection, key)
            if cached is not None:
                return cached["payload"]
            reserve_request(connection, host)
            try:
                raw = fetch_geocode(base, path, params, user_agent)
            finally:
                finish_request(connection, host)
            payload = normalized_response(path, raw)
            write_cached(connection, key, payload)
            return payload
