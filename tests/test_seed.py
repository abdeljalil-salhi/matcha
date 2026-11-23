from http import HTTPStatus
import random

from flask import Flask
from server.jobs.cleanup import clean
from server.jobs.seed import seed
from server.jobs.seed_identity import seed_identity
from server.jobs.seed_photo import legacy_seed_photo
from server.jobs.seed_refresh import LEGACY_BIO_SUFFIX, refresh_demo
from psycopg import Connection

from .helpers import PASSWORD, login


def test_seed_refresh_preserves_edits(backend: tuple[Flask, Connection]) -> None:
    """Upgrade legacy placeholders without changing edited or real profiles.

    Args:
        backend (tuple[Flask, Connection]): Test app and isolated database.

    Returns:
        None.
    """
    _, conn = backend
    seed(conn, PASSWORD)
    original = conn.execute(
        "SELECT first_name, last_name, bio FROM users WHERE username = 'demo_003'"
    ).fetchone()
    user_id = conn.execute(
        "SELECT id FROM users WHERE username = 'demo_003'"
    ).fetchone()["id"]
    original_photo = conn.execute(
        "SELECT content FROM photos WHERE user_id = %s", (user_id,)
    ).fetchone()["content"]
    old_photo = legacy_seed_photo(random.Random(42), 3)
    old_bio = "Demo profile 3. Interests include art, books."
    conn.execute(
        "UPDATE users SET first_name = 'Demo', last_name = 'Profile 003', bio = %s "
        "WHERE id = %s",
        (old_bio, user_id),
    )
    conn.execute(
        "UPDATE photos SET content = %s WHERE user_id = %s", (old_photo, user_id)
    )
    identity = seed_identity(3, "man", ["art", "books"])
    refresh_demo(conn, user_id, 3, identity, old_bio, old_photo, b"replacement")
    assert (
        conn.execute(
            "SELECT first_name, last_name, bio FROM users WHERE id = %s", (user_id,)
        ).fetchone()
        == identity
    )
    conn.execute(
        "UPDATE users SET bio = %s WHERE id = %s",
        (identity["bio"] + LEGACY_BIO_SUFFIX, user_id),
    )
    refresh_demo(conn, user_id, 3, identity, old_bio, old_photo, b"replacement")
    assert (
        conn.execute("SELECT bio FROM users WHERE id = %s", (user_id,)).fetchone()[
            "bio"
        ]
        == identity["bio"]
    )
    conn.execute(
        "UPDATE users SET first_name = 'Custom', last_name = 'Name', bio = 'My bio' "
        "WHERE id = %s",
        (user_id,),
    )
    seed(conn, PASSWORD)
    assert conn.execute(
        "SELECT first_name, last_name, bio FROM users WHERE id = %s", (user_id,)
    ).fetchone() == {"first_name": "Custom", "last_name": "Name", "bio": "My bio"}
    assert (
        bytes(
            conn.execute(
                "SELECT content FROM photos WHERE user_id = %s", (user_id,)
            ).fetchone()["content"]
        )
        == b"replacement"
    )
    # Leave the demo fixture as it was before exercising edits.
    conn.execute(
        "UPDATE users SET first_name = %s, last_name = %s, bio = %s WHERE id = %s",
        (original["first_name"], original["last_name"], original["bio"], user_id),
    )
    conn.execute(
        "UPDATE photos SET content = %s WHERE user_id = %s", (original_photo, user_id)
    )


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
    assert (
        conn.execute(
            "SELECT count(*) AS total FROM users WHERE is_demo AND map_visible"
        ).fetchone()["total"]
        == 500
    )
    conn.execute("UPDATE users SET map_visible = false WHERE username = 'demo_003'")
    seed(conn, PASSWORD)
    assert (
        conn.execute(
            "SELECT map_visible FROM users WHERE username = 'demo_003'"
        ).fetchone()["map_visible"]
        is False
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
