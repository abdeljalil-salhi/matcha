from http import HTTPStatus

import pytest
from uuid import uuid4

from flask import Flask
from flask.testing import FlaskClient
from psycopg import Connection
from pytest import MonkeyPatch

from .helpers import create_user


def send(client: FlaskClient, recipient: int) -> None:
    """Send one message through the API to create its notification event.

    Args:
        client (FlaskClient): Signed-in sender.
        recipient (int): Connected recipient ID.

    Returns:
        None.
    """
    response = client.post(
        f"/api/chat/{recipient}/messages",
        json={
            "body": "Hello",
            "client_id": str(uuid4()),
        },
    )
    assert response.status_code == HTTPStatus.CREATED, response.json


def test_message_groups_paginate_and_acknowledge_a_snapshot(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Group before paging and leave messages newer than a read snapshot unread.

    Args:
        backend (tuple[Flask, Connection]): Test app and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.

    Returns:
        None.
    """
    app, conn = backend
    a, alice = create_user(app, conn, "group_alice", monkeypatch)
    b, bob = create_user(app, conn, "group_bob", monkeypatch)
    conn.execute(
        "INSERT INTO likes (actor_id, target_id) VALUES (%s, %s), (%s, %s)",
        (alice, bob, bob, alice),
    )
    for _ in range(3):
        send(a, bob)
    for _ in range(2):
        conn.execute(
            "INSERT INTO notifications (recipient_id, actor_id, kind) "
            "VALUES (%s, %s, 'visit')",
            (bob, alice),
        )
    page = b.get("/api/notifications?limit=1").json
    assert page["unread"] == {"total": 2, "messages": 3}
    rows = []
    while page["notifications"]:
        rows.extend(page["notifications"])
        page = b.get(f"/api/notifications?limit=1&before={rows[-1]['id']}").json
    assert [row["kind"] for row in rows] == ["visit", "message"]
    group = rows[-1]
    assert group["unread_count"] == 3
    assert group["read_at"] is None
    assert a.put(f"/api/notifications/{group['id']}/read").status_code == 404
    send(a, bob)
    assert b.put(f"/api/notifications/{group['id']}/read").status_code == 204
    page = b.get("/api/notifications").json
    assert page["unread"] == {"total": 2, "messages": 1}
    latest = page["notifications"][0]
    assert latest["kind"] == "message"
    assert latest["id"] > group["id"]
    assert latest["unread_count"] == 1
    assert len(page["notifications"]) == 2
    assert b.put(f"/api/notifications/{latest['id']}/read").status_code == 204
    page = b.get("/api/notifications").json
    assert page["unread"] == {"total": 1, "messages": 0}
    assert page["notifications"][0]["unread_count"] == 0
    assert page["notifications"][0]["read_at"] is not None
    # Retain individual history rather than overwriting message events.
    assert (
        conn.execute(
            "SELECT count(*) AS total FROM notifications "
            "WHERE recipient_id = %s AND kind = 'message'",
            (bob,),
        ).fetchone()["total"]
        == 4
    )
    send(a, bob)
    page = b.get("/api/notifications").json
    assert page["unread"] == {"total": 2, "messages": 1}
    assert len(page["notifications"]) == 2
    through = page["notifications"][0]["id"]
    send(a, bob)
    assert (
        b.put("/api/notifications/read", json={"through": through}).status_code == 204
    )
    assert b.get("/api/notifications").json["unread"] == {"total": 1, "messages": 1}


def test_grouping_preserves_notification_visibility(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Apply mute, connection and block filters before grouping message events.

    Args:
        backend (tuple[Flask, Connection]): Test app and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.

    Returns:
        None.
    """
    app, conn = backend
    a, alice = create_user(app, conn, "visible_alice", monkeypatch)
    b, bob = create_user(app, conn, "visible_bob", monkeypatch)
    conn.execute(
        "INSERT INTO likes (actor_id, target_id) VALUES (%s, %s), (%s, %s)",
        (alice, bob, bob, alice),
    )
    send(a, bob)
    send(a, bob)
    conn.execute(
        "INSERT INTO mutes (actor_id, target_id) VALUES (%s, %s)", (bob, alice)
    )
    assert b.get("/api/notifications").json == {
        "notifications": [],
        "unread": {"total": 0, "messages": 0},
    }
    conn.execute("DELETE FROM mutes")
    assert b.get("/api/notifications").json["unread"] == {"total": 1, "messages": 2}
    conn.execute("DELETE FROM likes WHERE actor_id = %s", (bob,))
    assert b.get("/api/notifications").json["notifications"] == []
    conn.execute(
        "INSERT INTO likes (actor_id, target_id) VALUES (%s, %s)", (bob, alice)
    )
    conn.execute(
        "INSERT INTO blocks (actor_id, target_id) VALUES (%s, %s)", (bob, alice)
    )
    assert b.get("/api/notifications").json["notifications"] == []


@pytest.mark.parametrize("kind", ["visit", "like", "match", "unlike"])
def test_other_activity_groups_by_actor_and_kind(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch, kind: str
) -> None:
    """Collapse repeated activity and acknowledge only the selected group's snapshot.

    Args:
        backend (tuple[Flask, Connection]): Test app and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.
        kind (str): Non-message activity type.

    Returns:
        None.
    """
    app, conn = backend
    a, alice = create_user(app, conn, "activity_alice", monkeypatch)
    b, bob = create_user(app, conn, "activity_bob", monkeypatch)
    ids = []
    for _ in range(3):
        ids.append(
            conn.execute(
                "INSERT INTO notifications (recipient_id, actor_id, kind) "
                "VALUES (%s, %s, %s) RETURNING id",
                (bob, alice, kind),
            ).fetchone()["id"]
        )
    conn.execute(
        "INSERT INTO notifications (recipient_id, actor_id, kind) "
        "VALUES (%s, %s, %s)",
        (bob, alice, "visit" if kind != "visit" else "like"),
    )
    page = b.get("/api/notifications").json
    assert page["unread"] == {"total": 2, "messages": 0}
    group = next(row for row in page["notifications"] if row["kind"] == kind)
    assert group["id"] == ids[-1]
    assert group["unread_count"] == 3
    assert a.put(f"/api/notifications/{ids[-1]}/read").status_code == 404
    assert b.put(f"/api/notifications/{ids[1]}/read").status_code == 204
    page = b.get("/api/notifications").json
    assert page["unread"]["total"] == 2
    assert (
        next(row for row in page["notifications"] if row["kind"] == kind)[
            "unread_count"
        ]
        == 1
    )
    assert b.put(f"/api/notifications/{ids[-1]}/read").status_code == 204
    page = b.get("/api/notifications").json
    assert page["unread"] == {"total": 1, "messages": 0}
    assert len(page["notifications"]) == 2
