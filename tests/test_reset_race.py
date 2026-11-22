from http import HTTPStatus
from uuid import UUID

from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from .helpers import PASSWORD, create_user, login, take_mail
from .security_helpers import competing_requests, synchronize_user_locks

RESET_PASSWORDS = ("Cobalt!veranda?38-orchard", "Lantern!quartz?79-terrace")


def test_reset_token_can_only_win_once(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Consume one reset token concurrently and verify credential revocation.

    Args:
        backend (tuple[Flask, Connection]): Test app and database.
        monkeypatch (MonkeyPatch): SMTP and request synchronization fixture.

    Returns:
        None.
    """
    app, conn = backend
    username = "reset_race"
    session, user_id = create_user(app, conn, username, monkeypatch)
    another_session = app.test_client()
    assert login(another_session, username).status_code == HTTPStatus.OK
    response = session.post(
        "/api/auth/forgot-password", json={"email": f"{username}@example.test"}
    )
    assert response.status_code == HTTPStatus.ACCEPTED
    token = take_mail(conn, monkeypatch).get_content().split("#token=")[1].strip()
    clients = [app.test_client(), app.test_client()]

    with monkeypatch.context() as locks:
        synchronize_user_locks(locks, "server.auth.links.lock_users")
        responses = competing_requests(
            lambda: clients[0].post(
                "/api/auth/reset-password",
                json={"token": token, "password": RESET_PASSWORDS[0]},
            ),
            lambda: clients[1].post(
                "/api/auth/reset-password",
                json={"token": token, "password": RESET_PASSWORDS[1]},
            ),
        )
    assert sorted(response.status_code for response in responses) == [
        HTTPStatus.NO_CONTENT,
        HTTPStatus.BAD_REQUEST,
    ]
    winner = next(
        index
        for index, response in enumerate(responses)
        if response.status_code == HTTPStatus.NO_CONTENT
    )
    assert session.get("/api/me").status_code == HTTPStatus.UNAUTHORIZED
    assert another_session.get("/api/me").status_code == HTTPStatus.UNAUTHORIZED
    assert (
        conn.execute(
            "SELECT count(*) AS total FROM sessions WHERE user_id = %s", (user_id,)
        ).fetchone()["total"]
        == 0
    )
    assert (
        conn.execute(
            "SELECT 1 FROM account_links WHERE id = %s", (UUID(token.split(".")[0]),)
        ).fetchone()
        is None
    )

    assert login(clients[0], username, PASSWORD).status_code == HTTPStatus.UNAUTHORIZED
    assert (
        login(clients[0], username, RESET_PASSWORDS[1 - winner]).status_code
        == HTTPStatus.UNAUTHORIZED
    )
    assert (
        login(clients[0], username, RESET_PASSWORDS[winner]).status_code
        == HTTPStatus.OK
    )
    replay = clients[1].post(
        "/api/auth/reset-password",
        json={"token": token, "password": RESET_PASSWORDS[1 - winner]},
    )
    assert replay.status_code == HTTPStatus.BAD_REQUEST
    assert clients[0].get("/api/me").status_code == HTTPStatus.OK
