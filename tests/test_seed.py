from http import HTTPStatus

from flask import Flask
from server.jobs.cleanup import clean
from server.jobs.seed import seed
from psycopg import Connection

from .helpers import PASSWORD, login


def test_seed_is_repeatable(backend: tuple[Flask, Connection]) -> None:
    """Verify repeatable fixtures, demo login, and expired-session cleanup.

    Args:
        backend (tuple[Flask, Connection]): Test app and database.

    Returns:
        None.
    """
    app, conn = backend
    seed(conn, PASSWORD)
    seed(conn, PASSWORD)
    assert (
        conn.execute("SELECT count(*) FROM public_profiles WHERE is_demo").fetchone()[
            "count"
        ]
        == 500
    )
    client = app.test_client()
    assert login(client, "demo_001").status_code == HTTPStatus.OK
    assert login(client, "demo_003").status_code == HTTPStatus.UNAUTHORIZED
    assert client.get("/api/discovery/search?limit=100").status_code == HTTPStatus.OK
    conn.execute(
        "UPDATE sessions SET expires_at = now() WHERE user_id = (SELECT id FROM users "
        "WHERE username = 'demo_001')"
    )
    clean(conn)
    assert client.get("/api/me").status_code == HTTPStatus.UNAUTHORIZED
    assert (
        conn.execute(
            "SELECT last_seen FROM users WHERE username = 'demo_001'"
        ).fetchone()["last_seen"]
        is not None
    )
