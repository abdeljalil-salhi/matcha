from http import HTTPStatus
from collections.abc import Mapping

import pytest
from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from server.common.http import ApiError
from server.common.types import JsonObject
from server.location import geocoding

from .helpers import create_user


def test_gps_resolves_before_rounding(monkeypatch: MonkeyPatch) -> None:
    """Preserve precise consented coordinates during neighborhood lookup.

    Args:
        monkeypatch (MonkeyPatch): Fixture replacing external geocoding.

    Returns:
        None.
    """
    monkeypatch.setattr(geocoding, "local_reverse", lambda lat, lon: None)
    calls = []

    def provider(path: str, params: Mapping[str, str | int | float]) -> JsonObject:
        """Capture a reverse lookup and return a neighborhood fixture.

        Args:
            path (str): Requested geocoder endpoint.
            params (Mapping[str, str | int | float]): Geocoder query parameters.

        Returns:
            JsonObject: Neighborhood-level reverse geocoding result.
        """
        calls.append((path, params))
        return {
            "address": {
                "city": "Example City",
                "neighbourhood": "Example Area",
                "country_code": "fr",
            },
            "lat": "48.8867",
            "lon": "2.3431",
        }

    monkeypatch.setattr(geocoding, "provider", provider)
    result = geocoding.gps_location(48.8867, 2.3431)
    assert result[1] == "Example Area"
    assert calls[0][1]["lat"] == 48.8867
    assert calls[0][1]["lon"] == 2.3431


def test_gps_failure_preserves_location(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Reject city-only GPS results without changing the saved manual location.

    Args:
        backend (tuple[Flask, Connection]): Test app and isolated database.
        monkeypatch (MonkeyPatch): Fixture replacing geocoder responses.

    Returns:
        None.
    """
    app, connection = backend
    client, _ = create_user(app, connection, "gps_audit", monkeypatch)
    assert (
        client.put(
            "/api/me/location", json={"source": "manual", "query": "Paris"}
        ).status_code
        == HTTPStatus.OK
    )
    original = client.get("/api/me").json
    monkeypatch.setattr(geocoding, "local_reverse", lambda lat, lon: None)
    monkeypatch.setattr(
        geocoding,
        "provider",
        lambda path, params: {
            "address": {"city": "Remote City", "country_code": "us"},
            "lat": "35.12345",
            "lon": "-110.54321",
        },
    )
    response = client.put(
        "/api/me/location",
        json={
            "source": "gps",
            "latitude": 35.12345,
            "longitude": -110.54321,
            "consent": True,
        },
    )
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    saved = client.get("/api/me").json
    for field in ("city", "area", "country_code", "location_source", "location_set_at"):
        assert saved[field] == original[field]


def test_offline_gps_never_uses_a_distant_neighborhood(
    monkeypatch: MonkeyPatch,
) -> None:
    """Reject unknown GPS areas when an online provider is unavailable.

    Args:
        monkeypatch (MonkeyPatch): Fixture disabling external lookups.

    Returns:
        None.
    """
    monkeypatch.setattr(geocoding, "provider", lambda path, params: None)
    with pytest.raises(ApiError) as error:
        geocoding.gps_location(-40.12345, -150.54321)
    assert error.value.code == HTTPStatus.UNPROCESSABLE_ENTITY
