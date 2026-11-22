import hashlib
import json

from psycopg import Connection
from psycopg.types.json import Jsonb

from ..common.types import JsonValue
from .limits import (
    GEOCODER_CACHE_TTL_SECONDS,
    GEOCODER_CACHE_VERSION,
    GEOCODER_NEGATIVE_TTL_SECONDS,
)
from .types import CachedGeocode, GeocoderEndpoint, GeocoderParams


def cache_key(base: str, path: GeocoderEndpoint, params: GeocoderParams) -> str:
    """Hash a canonical provider request without storing raw queries or GPS input.

    Args:
        base (str): Configured provider base URL.
        path (GeocoderEndpoint): Search or reverse endpoint.
        params (GeocoderParams): Validated provider query parameters.

    Returns:
        str: SHA-256 cache identifier, scoped to the configured provider.
    """
    request = json.dumps(
        [GEOCODER_CACHE_VERSION, base, path, dict(params)],
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(request.encode()).hexdigest()


def read_cached(connection: Connection, key: str) -> CachedGeocode | None:
    """Read an unexpired shared result, including cached negative lookups.

    Args:
        connection (Connection): Autocommit provider connection.
        key (str): Hashed request identifier.

    Returns:
        CachedGeocode | None: Stored payload, or None for a cache miss.
    """
    return connection.execute(
        "SELECT payload FROM geocoder_cache WHERE cache_key = %s "
        "AND expires_at > clock_timestamp()",
        (key,),
    ).fetchone()


def write_cached(connection: Connection, key: str, payload: JsonValue) -> None:
    """Persist a normalized geocode using a shorter TTL for negative results.

    Args:
        connection (Connection): Autocommit provider connection.
        key (str): Hashed request identifier.
        payload (JsonValue): Sanitized response; None or an empty list is negative.

    Returns:
        None.
    """
    ttl = GEOCODER_CACHE_TTL_SECONDS if payload else GEOCODER_NEGATIVE_TTL_SECONDS
    connection.execute(
        "INSERT INTO geocoder_cache (cache_key, payload, expires_at) "
        "VALUES (%s, %s, clock_timestamp() + %s * interval '1 second') "
        "ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, "
        "expires_at = excluded.expires_at",
        (key, Jsonb(payload), ttl),
    )
