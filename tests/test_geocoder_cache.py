import pytest
from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from server.common.types import JsonValue
from server.jobs.cleanup import clean
from server.location.cache import cache_key
from server.location.types import GeocoderEndpoint, GeocoderParams

from .geocoder_helpers import RAW_PLACE, lookup, stub_geocoder


def test_shared_cache_reuses_sanitized_results(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Reuse cached place data without retaining precise coordinates or metadata.

    Args:
        backend (tuple[Flask, Connection]): App and isolated PostgreSQL connection.
        monkeypatch (MonkeyPatch): External transport replacement.

    Returns:
        None.
    """
    app, conn = backend
    stub = stub_geocoder(monkeypatch, [RAW_PLACE])
    result = lookup(app, "search", {"q": "A private query", "format": "jsonv2"})
    assert lookup(app, "search", {"format": "jsonv2", "q": "A private query"}) == result
    assert len(stub.calls) == 1
    assert stub.calls[0].get_header("User-agent") == "Matcha regression tests"
    cached = conn.execute(
        "SELECT *, expires_at - now() AS ttl FROM geocoder_cache"
    ).fetchone()
    assert 86390 < cached["ttl"].total_seconds() <= 86400
    assert cached["payload"][0]["lat"] == 48.89
    assert cached["payload"][0]["lon"] == 2.34
    assert set(cached["payload"][0]) == {"address", "lat", "lon"}
    assert set(cached["payload"][0]["address"]) == {
        "city",
        "neighbourhood",
        "country_code",
    }
    assert "A private query" not in cached["cache_key"]


def test_expired_cache_refreshes_and_cleanup_removes_it(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Refresh an expired cache record and purge it through normal worker cleanup.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): External transport replacement.

    Returns:
        None.
    """
    app, conn = backend
    stub = stub_geocoder(monkeypatch, [RAW_PLACE])
    lookup(app, "search", {"q": "Test City"})
    conn.execute("UPDATE geocoder_cache SET expires_at = now()")
    lookup(app, "search", {"q": "Test City"})
    assert len(stub.calls) == 2
    conn.execute("UPDATE geocoder_cache SET expires_at = now()")
    clean(conn)
    assert (
        conn.execute("SELECT count(*) AS total FROM geocoder_cache").fetchone()["total"]
        == 0
    )


@pytest.mark.parametrize(
    "path,payload,params",
    [
        ("search", [], {"q": "Unknown City"}),
        ("reverse", {"error": "Unable to geocode"}, {"lat": 0, "lon": 0}),
    ],
)
def test_negative_results_have_a_short_shared_cache(
    backend: tuple[Flask, Connection],
    monkeypatch: MonkeyPatch,
    path: GeocoderEndpoint,
    payload: JsonValue,
    params: GeocoderParams,
) -> None:
    """Cache empty search and null reverse results for five minutes.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): External transport replacement.
        path (GeocoderEndpoint): Parameterized endpoint.
        payload (JsonValue): Provider's not-found response.
        params (GeocoderParams): Lookup parameters.

    Returns:
        None.
    """
    app, conn = backend
    stub = stub_geocoder(monkeypatch, payload)
    assert not lookup(app, path, params)
    assert not lookup(app, path, params)
    assert len(stub.calls) == 1
    ttl = conn.execute(
        "SELECT expires_at - now() AS ttl FROM geocoder_cache"
    ).fetchone()["ttl"]
    assert 290 < ttl.total_seconds() <= 300


def test_provider_changes_use_a_separate_cache(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Avoid reusing results after changing the configured geocoder.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Provider environment and transport replacement.

    Returns:
        None.
    """
    app, _ = backend
    stub = stub_geocoder(monkeypatch, [RAW_PLACE])
    lookup(app, "search", {"q": "Test City"})
    monkeypatch.setenv("GEOCODER_URL", "https://other-geocoder.example.test")
    lookup(app, "search", {"q": "Test City"})
    assert len(stub.calls) == 2
    assert cache_key("https://one", "search", {"q": "City"}) != cache_key(
        "https://two", "search", {"q": "City"}
    )
