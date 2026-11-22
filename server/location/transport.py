import json
from http import HTTPStatus
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..common.http import ApiError
from ..common.types import JsonValue
from .limits import GEOCODER_TIMEOUT_SECONDS, MAX_GEOCODER_RESPONSE_BYTES
from .types import GeocoderEndpoint, GeocoderParams


def fetch_geocode(
    base: str, path: GeocoderEndpoint, params: GeocoderParams, user_agent: str
) -> JsonValue:
    """Fetch bounded JSON from the provider after the caller acquires its slot.

    Args:
        base (str): Validated HTTP(S) provider base URL.
        path (GeocoderEndpoint): Search or reverse endpoint.
        params (GeocoderParams): Validated query parameters.
        user_agent (str): Application identity and optional contact information.

    Returns:
        JsonValue: Decoded provider response; transport errors raise HTTP 503.
    """
    try:
        with urlopen(
            Request(
                f"{base}/{path}?{urlencode(params)}", headers={"User-Agent": user_agent}
            ),
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
