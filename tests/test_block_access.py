from http import HTTPStatus
from uuid import uuid4

from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from .helpers import create_user
from .profile_helpers import complete


def test_block_revokes_chat_and_photo_access(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Revoke both participants' access immediately after a block succeeds.

    Args:
        backend (tuple[Flask, Connection]): Test app and database.
        monkeypatch (MonkeyPatch): SMTP fixture.

    Returns:
        None.
    """
    app, conn = backend
    first, first_id = create_user(app, conn, "block_first", monkeypatch)
    second, second_id = create_user(app, conn, "block_second", monkeypatch)
    first_photo = complete(first, "woman", None)
    second_photo = complete(second, "man", None)
    assert first.put(f"/api/profiles/{second_id}/like").status_code == HTTPStatus.OK
    assert second.put(f"/api/profiles/{first_id}/like").json["connected"]
    message = first.post(
        f"/api/chat/{second_id}/messages",
        json={"body": "Visible before blocking.", "client_id": str(uuid4())},
    )
    assert message.status_code == HTTPStatus.CREATED
    pairs = (
        (first, second_id, second_photo),
        (second, first_id, first_photo),
    )
    for client, other_id, photo_id in pairs:
        assert client.get(f"/api/photos/{photo_id}").status_code == HTTPStatus.OK
        history = client.get(f"/api/chat/{other_id}/messages")
        assert history.status_code == HTTPStatus.OK
        assert [item["id"] for item in history.json["messages"]] == [message.json["id"]]

    assert (
        first.put(f"/api/profiles/{second_id}/block").status_code
        == HTTPStatus.NO_CONTENT
    )
    for client, other_id, photo_id in pairs:
        assert client.get(f"/api/photos/{photo_id}").status_code == HTTPStatus.NOT_FOUND
        assert (
            client.get(f"/api/chat/{other_id}/messages").status_code
            == HTTPStatus.FORBIDDEN
        )
        denied = client.post(
            f"/api/chat/{other_id}/messages",
            json={"body": "Denied after blocking.", "client_id": str(uuid4())},
        )
        assert denied.status_code == HTTPStatus.FORBIDDEN
        assert other_id not in {
            row["id"] for row in client.get("/api/chat").json["conversations"]
        }
        assert client.get("/api/notifications").json["unread"]["messages"] == 0
    assert (
        conn.execute(
            "SELECT count(*) AS total FROM messages WHERE sender_id = %s "
            "AND recipient_id = %s",
            (first_id, second_id),
        ).fetchone()["total"]
        == 1
    )
