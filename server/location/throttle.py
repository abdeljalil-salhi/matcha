import hashlib
import time
from collections.abc import Iterator
from contextlib import contextmanager

from psycopg import Connection

from .limits import GEOCODER_ADVISORY_NAMESPACE, GEOCODER_INTERVAL_SECONDS


@contextmanager
def provider_lock(connection: Connection, host: str) -> Iterator[None]:
    """Serialize provider calls across processes and release the pooled session lock.

    Args:
        connection (Connection): Dedicated autocommit connection held by the caller.
        host (str): Normalized provider hostname, shared by search and reverse.

    Yields:
        None: Exclusive access until the caller completes or raises an error.
    """
    key = int.from_bytes(hashlib.sha256(host.encode()).digest()[:4], signed=True)
    connection.execute(
        "SELECT pg_advisory_lock(%s, %s)", (GEOCODER_ADVISORY_NAMESPACE, key)
    )
    try:
        yield
    finally:
        if not connection.closed:
            connection.execute(
                "SELECT pg_advisory_unlock(%s, %s)",
                (GEOCODER_ADVISORY_NAMESPACE, key),
            )


def reserve_request(connection: Connection, host: str) -> None:
    """Wait out the shared cooldown and durably reserve an external attempt.

    Args:
        connection (Connection): Autocommit connection holding the provider lock.
        host (str): Normalized provider hostname.

    Returns:
        None.
    """
    window = connection.execute(
        "SELECT greatest(0, extract(epoch FROM next_request_at - clock_timestamp()))"
        "::double precision AS delay FROM geocoder_windows WHERE provider_host = %s",
        (host,),
    ).fetchone()
    if window and window["delay"]:
        time.sleep(window["delay"])
    finish_request(connection, host)


def finish_request(connection: Connection, host: str) -> None:
    """Keep a full cooldown after successful or failed external requests.

    Args:
        connection (Connection): Autocommit connection holding the provider lock.
        host (str): Normalized provider hostname.

    Returns:
        None.
    """
    connection.execute(
        "INSERT INTO geocoder_windows (provider_host, next_request_at) "
        "VALUES (%s, clock_timestamp() + %s * interval '1 second') "
        "ON CONFLICT (provider_host) DO UPDATE SET "
        "next_request_at = excluded.next_request_at",
        (host, GEOCODER_INTERVAL_SECONDS),
    )
