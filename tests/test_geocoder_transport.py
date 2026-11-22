from http import HTTPStatus

import pytest
from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from server.common.http import ApiError
from server.location.limits import MAX_GEOCODER_RESPONSE_BYTES

from .geocoder_helpers import lookup, stub_geocoder


@pytest.mark.parametrize("kind", ["invalid_json", "unexpected_schema", "oversized"])
def test_invalid_responses_are_not_cached(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch, kind: str
) -> None:
    """Reject malformed or oversized responses without persisting a false result.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): External transport replacement.
        kind (str): Provider failure selected by the test parameters.

    Returns:
        None.
    """
    app, conn = backend
    stub = stub_geocoder(monkeypatch, [])
    stub.body = {
        "invalid_json": b"not JSON",
        "unexpected_schema": b'{"unsupported":true}',
        "oversized": b"x" * (MAX_GEOCODER_RESPONSE_BYTES + 1),
    }[kind]
    with pytest.raises(ApiError) as error:
        lookup(app, "search", {"q": "Test City"})
    assert error.value.code == HTTPStatus.SERVICE_UNAVAILABLE
    assert (
        conn.execute("SELECT count(*) AS total FROM geocoder_cache").fetchone()["total"]
        == 0
    )
