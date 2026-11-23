from http import HTTPStatus
from uuid import uuid4

from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from .helpers import create_user
from .profile_helpers import complete


def _connect(app: Flask, connection: Connection, monkeypatch: MonkeyPatch):
    a, a_id = create_user(app, connection, "gif_alice", monkeypatch)
    b, b_id = create_user(app, connection, "gif_bob", monkeypatch)
    complete(a, "woman", None)
    complete(b, "man", None)
    assert a.put(f"/api/profiles/{b_id}/like").status_code == HTTPStatus.OK
    assert b.put(f"/api/profiles/{a_id}/like").status_code == HTTPStatus.OK
    return a, b, a_id, b_id


def test_gif_search_proxy_returns_normalized_results(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    app, connection = backend
    client, _ = create_user(app, connection, "gif_search", monkeypatch)
    app.config["GIPHY_API_KEY"] = "test-key"

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return b"""{"data":[{"id":"abc","title":"Happy Cat","images":{
                "original":{"url":"https://media.giphy.com/media/abc/giphy.gif","width":"480","height":"270"},
                "fixed_width_small":{"url":"https://media.giphy.com/media/abc/100w.gif","width":"100","height":"56"}
            }}]}"""

    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr("server.chat.giphy.urlopen", fake_urlopen)

    response = client.get("/api/chat/gifs", query_string={"q": "happy cat", "limit": 8})
    assert response.status_code == HTTPStatus.OK
    assert response.json == {
        "gifs": [
            {
                "id": "abc",
                "title": "Happy Cat",
                "url": "https://media.giphy.com/media/abc/giphy.gif",
                "preview_url": "https://media.giphy.com/media/abc/100w.gif",
                "width": 100,
                "height": 56,
            }
        ]
    }
    assert "api_key=test-key" in captured["url"]
    assert "q=happy+cat" in captured["url"]


def test_gif_search_requires_configuration(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    app, connection = backend
    client, _ = create_user(app, connection, "gif_nokey", monkeypatch)
    app.config["GIPHY_API_KEY"] = ""
    response = client.get("/api/chat/gifs", query_string={"q": "cats"})
    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE


def test_send_and_read_gif_message(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    app, connection = backend
    alice, bob, _, bob_id = _connect(app, connection, monkeypatch)
    payload = {
        "kind": "gif",
        "body": "",
        "client_id": str(uuid4()),
        "media_url": "https://media.giphy.com/media/abc/giphy.gif",
        "media_alt": "Happy cat",
    }
    sent = alice.post(f"/api/chat/{bob_id}/messages", json=payload)
    assert sent.status_code == HTTPStatus.CREATED
    assert sent.json["kind"] == "gif"
    assert sent.json["body"] == ""
    assert sent.json["media_url"] == payload["media_url"]
    assert sent.json["media_alt"] == "Happy cat"

    listed = bob.get(f"/api/chat/{sent.json['sender_id']}/messages")
    assert listed.status_code == HTTPStatus.OK
    assert listed.json["messages"][-1]["id"] == sent.json["id"]
    assert listed.json["messages"][-1]["kind"] == "gif"

    retry = alice.post(f"/api/chat/{bob_id}/messages", json=payload)
    assert retry.status_code == HTTPStatus.OK
    assert retry.json["id"] == sent.json["id"]


def test_gif_message_rejects_non_giphy_url(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    app, connection = backend
    alice, _, _, bob_id = _connect(app, connection, monkeypatch)
    response = alice.post(
        f"/api/chat/{bob_id}/messages",
        json={
            "kind": "gif",
            "client_id": str(uuid4()),
            "media_url": "https://evil.example/cat.gif",
        },
    )
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
