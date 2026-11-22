from http import HTTPStatus
from urllib.error import URLError

import pytest
from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from server.common.http import ApiError
from server.common.types import JsonObject
from server.location.limits import GEOCODER_ADVISORY_NAMESPACE
from server.location.provider import provider
from server.location.throttle import provider_lock

from .geocoder_helpers import RAW_PLACE, lookup, stub_geocoder


def test_failed_requests_still_consume_a_shared_slot(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Throttle provider failures, avoid caching errors, and release session locks.

    Args:
        backend (tuple[Flask, Connection]): App and isolated PostgreSQL database.
        monkeypatch (MonkeyPatch): External transport replacement.

    Returns:
        None.
    """
    app, conn = backend
    stub = stub_geocoder(monkeypatch, [RAW_PLACE])
    stub.error = URLError("simulated provider outage")
    with pytest.raises(ApiError) as error:
        lookup(app, "search", {"q": "Test City"})
    assert error.value.code == HTTPStatus.SERVICE_UNAVAILABLE
    assert (
        conn.execute("SELECT count(*) AS total FROM geocoder_cache").fetchone()["total"]
        == 0
    )
    stub.error = None
    assert lookup(app, "search", {"q": "Test City"})
    assert stub.starts[1] - stub.starts[0] >= 1
    locks = conn.execute(
        "SELECT count(*) AS total FROM pg_locks WHERE locktype = 'advisory' "
        "AND classid = %s",
        (GEOCODER_ADVISORY_NAMESPACE,),
    ).fetchone()["total"]
    assert locks == 0


def test_contention_is_retryable_and_cache_hits_do_not_wait(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Expose bounded contention as HTTP 503 while allowing cached reads immediately.

    Args:
        backend (tuple[Flask, Connection]): App and isolated PostgreSQL database.
        monkeypatch (MonkeyPatch): External transport replacement.

    Returns:
        None.
    """
    app, conn = backend
    stub = stub_geocoder(monkeypatch, [RAW_PLACE])

    @app.get("/test-geocoder")
    def geocoder_response() -> JsonObject:
        """Run the test lookup through the production HTTP error hooks.

        Args:
            None.

        Returns:
            JsonObject: Provider result exposed only on this isolated test app.
        """
        return {"result": provider("search", {"q": "Test City"})}

    client = app.test_client()
    with provider_lock(conn, "geocoder.example.test"):
        response = client.get("/test-geocoder")
    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.headers["Retry-After"]
    assert not stub.calls
    assert client.get("/test-geocoder").status_code == HTTPStatus.OK
    with provider_lock(conn, "geocoder.example.test"):
        assert client.get("/test-geocoder").status_code == HTTPStatus.OK
    assert len(stub.calls) == 1
