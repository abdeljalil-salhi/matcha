import threading
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from uuid import uuid4

from flask import Flask
from flask.testing import FlaskClient
from psycopg import Connection
from pytest import MonkeyPatch
from werkzeug.test import TestResponse

from .helpers import create_user
from .profile_helpers import complete, upload


def test_profiles_chat_and_notifications(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Verify profile discovery, relationships, and connected chat.

    Args:
        backend (tuple[Flask, Connection]): Test app and database.
        monkeypatch (MonkeyPatch): SMTP fixture.

    Returns:
        None.
    """
    app, conn = backend
    a, alice = create_user(app, conn, "alice_test", monkeypatch)
    b, bob = create_user(app, conn, "bob_test", monkeypatch)
    c, carol = create_user(app, conn, "carol_test", monkeypatch)
    primary = complete(b, "man", None, "Montmartre")
    complete(c, "woman", ["woman"], "Lyon", ["art", "vegan"])
    assert a.put(f"/api/profiles/{bob}/like").status_code == HTTPStatus.CONFLICT
    complete(a, "woman", ["man"])
    assert (
        a.put(
            "/api/me/location",
            json={
                "source": "gps",
                "latitude": 48.8867,
                "longitude": 2.3431,
                "consent": False,
            },
        ).status_code
        == HTTPStatus.UNPROCESSABLE_ENTITY
    )
    response = a.put(
        "/api/me/location",
        json={
            "source": "gps",
            "latitude": 48.8867,
            "longitude": 2.3431,
            "consent": True,
        },
    )
    assert response.status_code == HTTPStatus.OK, response.json
    assert response.json["area"] == "Montmartre"
    assert a.get("/api/me").json["location_source"] == "gps"
    assert upload(a, valid=False).status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    extras = [upload(b).json["id"] for _ in range(4)]
    assert upload(b).status_code == HTTPStatus.CONFLICT
    assert (
        b.put(f"/api/me/photos/{extras[0]}/primary").status_code
        == HTTPStatus.NO_CONTENT
    )
    assert b.delete(f"/api/me/photos/{extras[0]}").status_code == HTTPStatus.NO_CONTENT
    response = a.get(f"/api/photos/{primary}")
    assert response.status_code == HTTPStatus.OK and response.mimetype == "image/jpeg"
    suggestions = a.get(
        "/api/discovery/suggestions?location=Paris&tag=art&sort=common_tags"
    )
    assert suggestions.status_code == HTTPStatus.OK, suggestions.json
    assert [item["id"] for item in suggestions.json["profiles"]] == [bob]
    results = a.get(
        "/api/discovery/search?location=Lyon&tag=vegan&min_age=18&max_fame=100&sort=age"
    )
    assert results.status_code == HTTPStatus.OK, results.json
    assert [item["id"] for item in results.json["profiles"]] == [carol]
    profile = a.get(f"/api/profiles/{bob}").json
    assert {"email", "password_hash", "latitude", "longitude"}.isdisjoint(profile)
    assert profile["online"] is True
    assert a.post(f"/api/profiles/{bob}/visits").status_code == HTTPStatus.NO_CONTENT
    assert a.post(f"/api/profiles/{bob}/visits").status_code == HTTPStatus.NO_CONTENT
    assert b.get("/api/me/visitors").json["visitors"][0]["id"] == alice
    assert [
        notification["kind"]
        for notification in b.get("/api/notifications").json["notifications"]
    ] == ["visit"]
    assert a.put(f"/api/profiles/{bob}/report").status_code == HTTPStatus.NO_CONTENT
    assert a.get(f"/api/chat/{bob}/messages").status_code == HTTPStatus.FORBIDDEN

    barrier = threading.Barrier(2)

    def like(client: FlaskClient, target: int) -> TestResponse:
        """Send a like after both concurrent test clients are ready.

        Args:
            client (FlaskClient): Signed-in client.
            target (int): Target user ID.

        Returns:
            TestResponse: Like response.
        """
        barrier.wait(timeout=3)
        return client.put(f"/api/profiles/{target}/like")

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(like, a, bob)
        f2 = executor.submit(like, b, alice)
        assert sorted(
            [f1.result().json["connected"], f2.result().json["connected"]]
        ) == [False, True]
    assert a.get(f"/api/profiles/{bob}").json["likes_you"]
    assert b.get("/api/me/likes").json["likes"][0]["id"] == alice
    assert a.get("/api/chat").json["conversations"][0]["id"] == bob
    payload = {"body": "<b>Plain-text message</b>", "client_id": str(uuid4())}
    message = a.post(f"/api/chat/{bob}/messages", json=payload)
    assert message.status_code == HTTPStatus.CREATED, message.json
    assert (
        a.post(f"/api/chat/{bob}/messages", json=payload).status_code == HTTPStatus.OK
    )
    received = b.get(f"/api/chat/{alice}/messages?after=0").json["messages"]
    assert [item["body"] for item in received] == [payload["body"]]
    inbox = b.get("/api/notifications").json
    assert inbox["unread"]["messages"] == 1
    assert (
        b.put(
            "/api/notifications/read", json={"through": inbox["notifications"][0]["id"]}
        ).status_code
        == HTTPStatus.NO_CONTENT
    )
    assert b.get("/api/notifications").json["unread"] == {"messages": 0, "total": 0}
    assert a.delete(f"/api/profiles/{bob}/like").status_code == HTTPStatus.NO_CONTENT
    assert (
        a.post(f"/api/chat/{bob}/messages", json=payload).status_code
        == HTTPStatus.FORBIDDEN
    )
    assert b.get("/api/notifications").json["notifications"][0]["kind"] == "unlike"
    assert a.put(f"/api/profiles/{bob}/block").status_code == HTTPStatus.NO_CONTENT
    assert b.get(f"/api/profiles/{alice}").status_code == HTTPStatus.NOT_FOUND
    assert a.get(f"/api/photos/{primary}").status_code == HTTPStatus.NOT_FOUND
    assert b.get("/api/notifications").json["notifications"] == []
    assert a.get("/api/discovery/search?location=Paris").json["profiles"] == []
    assert a.delete(f"/api/profiles/{bob}/block").status_code == HTTPStatus.NO_CONTENT
    assert a.get(f"/api/chat/{bob}/messages").status_code == HTTPStatus.FORBIDDEN
    assert a.delete("/api/me/location").status_code == HTTPStatus.NO_CONTENT
    assert a.get("/api/discovery/search").status_code == HTTPStatus.CONFLICT
