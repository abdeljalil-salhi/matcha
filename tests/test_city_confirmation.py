from http import HTTPStatus

import pytest
from flask import Flask
from itsdangerous import TimestampSigner
from psycopg import Connection
from pytest import MonkeyPatch

from server.common.http import ApiError
from server.location.confirmation import city_suggestion, confirmed_city
from server.location.limits import CITY_CONFIRMATION_MAX_AGE_SECONDS

from .helpers import create_user


@pytest.mark.parametrize("failure", ["tampered", "expired", "other_account"])
def test_city_confirmation_rejects_untrusted_tokens(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch, failure: str
) -> None:
    """Reject altered, expired, or account-mismatched tokens without saving.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Signer clock replacement.
        failure (str): Token rejection scenario.

    Returns:
        None.
    """
    app, conn = backend
    client, user_id = create_user(app, conn, "city_token", monkeypatch)
    with app.app_context():
        token = city_suggestion(("City", None, "MA", 32.22, -7.94), user_id)[
            "confirmation_token"
        ]
    if failure == "tampered":
        token += "invalid"
    elif failure == "expired":
        now = TimestampSigner.get_timestamp(TimestampSigner("test"))
        monkeypatch.setattr(
            TimestampSigner,
            "get_timestamp",
            lambda self: now + CITY_CONFIRMATION_MAX_AGE_SECONDS + 1,
        )
    else:
        client, _ = create_user(app, conn, "other_city", monkeypatch)
    response = client.put(
        "/api/me/location",
        json={
            "source": "manual",
            "confirmation_token": token,
        },
    )
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert client.get("/api/me").json["city"] is None


def test_city_token_cannot_bypass_gps_consent(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Require GPS consent and reject manual tokens submitted with a GPS source.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.

    Returns:
        None.
    """
    app, conn = backend
    client, _ = create_user(app, conn, "city_consent", monkeypatch)
    for payload in [
        {"source": "gps", "latitude": 32.22, "longitude": -7.94, "consent": False},
        {"source": "gps", "confirmation_token": "invalid"},
    ]:
        assert client.put("/api/me/location", json=payload).status_code == 422
    assert client.get("/api/me").json["city"] is None


def test_oversized_city_token(backend: tuple[Flask, Connection]) -> None:
    """Reject oversized signed-token input before decoding it.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.

    Returns:
        None.
    """
    app, _ = backend
    with app.app_context(), pytest.raises(ApiError):
        confirmed_city("x" * 2049, 1)
