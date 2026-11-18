from http import HTTPStatus

from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch
from .helpers import ORIGIN, PASSWORD, create_user, login, register, take_mail

NEW_PASSWORD = "Notebook!kiwi+52-pergola"


def test_account_lifecycle(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Verify registration, login, email change, reset, and logout.

    Args:
        backend (tuple[Flask, Connection]): Test app and database.
        monkeypatch (MonkeyPatch): SMTP fixture.

    Returns:
        None.
    """
    app, conn = backend
    client = app.test_client()
    assert client.get("/api/health").json == {"status": "ok"}
    for value in (None, 123, ["account"], {"name": "account"}):
        response = client.post(
            "/api/auth/login", json={"username": value, "password": PASSWORD}
        )
        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
        assert response.json["error"]["message"] == "username must be text."
    response = client.post("/api/auth/forgot-password", json={"email": 123})
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json["error"]["message"] == "email must be text."
    assert client.get("/api/me").status_code == HTTPStatus.UNAUTHORIZED
    assert (
        register(client, "common_word", "extraordinaire").status_code
        == HTTPStatus.UNPROCESSABLE_ENTITY
    )
    assert (
        register(client, "common_spanish", "extraordinario").status_code
        == HTTPStatus.UNPROCESSABLE_ENTITY
    )
    assert login(client, "wrong_name").status_code == HTTPStatus.UNAUTHORIZED
    client, user_id = create_user(app, conn, "account_test", monkeypatch)
    assert register(client, "account_test").status_code == HTTPStatus.CONFLICT
    assert (
        client.patch(
            "/api/me",
            json={"first_name": "New"},
            headers={"Origin": "https://foreign.test"},
        ).status_code
        == HTTPStatus.FORBIDDEN
    )
    assert (
        client.patch(
            "/api/me",
            json={"first_name": "New", "last_name": "Name"},
            headers={"Origin": ORIGIN},
        ).status_code
        == HTTPStatus.NO_CONTENT
    )
    assert client.get("/api/me").json["first_name"] == "New"
    assert (
        conn.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
        .fetchone()["password_hash"]
        .startswith("$argon2id$")
    )
    assert (
        client.post(
            "/api/me/email-change",
            json={"email": "changed@example.test", "password": PASSWORD},
        ).status_code
        == HTTPStatus.ACCEPTED
    )
    email = take_mail(conn, monkeypatch)
    assert email["To"] == "changed@example.test"
    token = email.get_content().split("#token=")[1].strip()
    assert (
        client.post("/api/auth/confirm-email", json={"token": token}).status_code
        == HTTPStatus.NO_CONTENT
    )
    assert client.get("/api/me").json["email"] == "changed@example.test"
    assert (
        client.post(
            "/api/auth/forgot-password", json={"email": "changed@example.test"}
        ).status_code
        == HTTPStatus.ACCEPTED
    )
    token = take_mail(conn, monkeypatch).get_content().split("#token=")[1].strip()
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": token, "password": NEW_PASSWORD}
        ).status_code
        == HTTPStatus.NO_CONTENT
    )
    assert client.get("/api/me").status_code == HTTPStatus.UNAUTHORIZED
    assert login(client, "account_test").status_code == HTTPStatus.UNAUTHORIZED
    assert login(client, "account_test", NEW_PASSWORD).status_code == HTTPStatus.OK
    assert client.post("/api/auth/logout").status_code == HTTPStatus.NO_CONTENT
    assert client.get("/api/me").status_code == HTTPStatus.UNAUTHORIZED
