import io
import json
import time
from dataclasses import dataclass, field
from urllib.error import URLError
from urllib.request import Request

from flask import Flask
from pytest import MonkeyPatch

from server.common.types import JsonObject, JsonValue
from server.location import transport
from server.location.provider import provider
from server.location.types import GeocoderEndpoint, GeocoderParams

RAW_PLACE: JsonObject = {
    "address": {
        "city": "Test City",
        "neighbourhood": "Test Area",
        "country_code": "fr",
        "road": "Discard this street",
        "house_number": "99",
    },
    "lat": "48.8867123",
    "lon": "2.3431567",
    "display_name": "Discard this metadata",
}


@dataclass
class GeocoderStub:
    """Local transport double shared by geocoder integration tests."""

    body: bytes
    error: URLError | None = None
    calls: list[Request] = field(default_factory=list)
    starts: list[float] = field(default_factory=list)

    def __call__(self, request: Request, timeout: int) -> io.BytesIO:
        """Return local response bytes without contacting an external provider.

        Args:
            request (Request): Outbound request captured for assertions.
            timeout (int): Configured network timeout.

        Returns:
            io.BytesIO: Context-managed response body, unless a failure is configured.
        """
        self.calls.append(request)
        self.starts.append(time.monotonic())
        if self.error:
            raise self.error
        return io.BytesIO(self.body)


def stub_geocoder(monkeypatch: MonkeyPatch, payload: JsonValue) -> GeocoderStub:
    """Configure a fake provider and capture transport calls.

    Args:
        monkeypatch (MonkeyPatch): Fixture restoring environment and transport.
        payload (JsonValue): JSON returned by the local transport double.

    Returns:
        GeocoderStub: Mutable stub with request and timing records.
    """
    monkeypatch.setenv("GEOCODER_URL", "https://geocoder.example.test")
    monkeypatch.setenv("GEOCODER_USER_AGENT", "Matcha regression tests")
    stub = GeocoderStub(json.dumps(payload).encode())
    monkeypatch.setattr(transport, "urlopen", stub)
    return stub


def lookup(app: Flask, path: GeocoderEndpoint, params: GeocoderParams) -> JsonValue:
    """Perform a provider lookup in an independent Flask application context.

    Args:
        app (Flask): App whose database pool should handle the request.
        path (GeocoderEndpoint): Search or reverse endpoint.
        params (GeocoderParams): Provider parameters.

    Returns:
        JsonValue: Normalized provider result.
    """
    with app.app_context():
        return provider(path, params)
