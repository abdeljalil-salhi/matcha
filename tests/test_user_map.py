from http import HTTPStatus

import pytest
from flask import Flask
from flask.testing import FlaskClient
from psycopg import Connection
from pytest import MonkeyPatch

from .helpers import create_user
from .profile_helpers import complete

WORLD = "west=-180&east=180&south=-90&north=90"


def sharing(client: FlaskClient, visible: bool = True) -> None:
    """Set test map visibility using the explicit sharing endpoint.

    Args:
        client (FlaskClient): Signed-in test account.
        visible (bool): Desired opt-in state.

    Returns:
        None.
    """
    response = client.put("/api/me/map", json={"map_visible": visible, "consent": True})
    assert response.status_code == HTTPStatus.OK, response.json


def test_map_is_opt_in_and_returns_only_compatible_public_points(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Require opt-in and enforce preferences, blocks, public fields and revocation.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.

    Returns:
        None.
    """
    app, conn = backend
    a, alice = create_user(app, conn, "map_alice", monkeypatch)
    b, bob = create_user(app, conn, "map_bob", monkeypatch)
    complete(a, "woman", ["man"])
    complete(b, "man", ["woman"])
    assert b.get("/api/me/map").json["map_visible"] is False
    assert a.get(f"/api/map/profiles?{WORLD}").json["profiles"] == []
    assert b.put("/api/me/map", json={"map_visible": True}).status_code == 422
    sharing(b)
    # Even future higher-precision storage cannot leak through map output or filters.
    conn.execute(
        "UPDATE users SET latitude = 48.85669, longitude = 2.35229 WHERE id = %s",
        (bob,),
    )
    response = a.get(f"/api/map/profiles?{WORLD}")
    assert response.status_code == 200
    points = response.json["profiles"]
    assert len(points) == 1
    assert points[0]["id"] == bob
    assert points[0]["latitude"] == 48.86
    assert points[0]["longitude"] == 2.35
    rounded_box = "west=2.349&east=2.351&south=48.859&north=48.861"
    assert a.get(f"/api/map/profiles?{rounded_box}").json["profiles"][0]["id"] == bob
    private_box = "west=2.3522&east=2.3523&south=48.8566&north=48.8567"
    assert a.get(f"/api/map/profiles?{private_box}").json["profiles"] == []
    assert not {"email", "password_hash", "last_seen", "location_set_at"} & set(
        points[0]
    )
    assert b.get(f"/api/map/profiles?{WORLD}").json["profiles"] == []
    conn.execute("UPDATE users SET seeks = ARRAY['man'] WHERE id = %s", (bob,))
    assert a.get(f"/api/map/profiles?{WORLD}").json["profiles"] == []
    conn.execute("UPDATE users SET seeks = NULL WHERE id = %s", (bob,))
    conn.execute(
        "INSERT INTO blocks (actor_id, target_id) VALUES (%s, %s)", (bob, alice)
    )
    assert a.get(f"/api/map/profiles?{WORLD}").json["profiles"] == []
    conn.execute("DELETE FROM blocks")
    sharing(b, False)
    assert a.get(f"/api/map/profiles?{WORLD}").json["profiles"] == []
    sharing(b)
    assert b.delete("/api/me/location").status_code == 204
    assert b.get("/api/me/map").json == {"map_visible": False, "center": None}
    assert a.get(f"/api/map/profiles?{WORLD}").json["profiles"] == []


def test_map_pagination_and_antimeridian(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Return bounded stable pages and include both sides of a dateline viewport.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.

    Returns:
        None.
    """
    app, conn = backend
    clients = []
    ids = []
    for name in ("map_viewer", "map_east", "map_west"):
        client, user_id = create_user(app, conn, name, monkeypatch)
        complete(client, "woman", None)
        clients.append(client)
        ids.append(user_id)
    for client in clients[1:]:
        sharing(client)
    conn.execute(
        "UPDATE users SET latitude = 0, longitude = 179.5 WHERE id = %s", (ids[1],)
    )
    conn.execute(
        "UPDATE users SET latitude = 0, longitude = -179.5 WHERE id = %s", (ids[2],)
    )
    query = "west=170&east=-170&south=-10&north=10&limit=1"
    first = clients[0].get(f"/api/map/profiles?{query}").json
    assert first["has_more"] is True
    second = (
        clients[0].get(f"/api/map/profiles?{query}&after={first['next_after']}").json
    )
    assert second["has_more"] is False
    assert second["next_after"] is None
    assert [first["profiles"][0]["id"], second["profiles"][0]["id"]] == ids[1:]
    assert (
        clients[0]
        .get("/api/map/profiles?west=-10&east=10&south=-10&north=10")
        .json["profiles"]
        == []
    )


@pytest.mark.parametrize(
    "query",
    [
        "",
        "west=nan&east=180&south=-90&north=90",
        "west=-180&east=inf&south=-90&north=90",
        "west=0&east=0&south=-10&north=10",
        "west=-180&east=180&south=30&north=10",
        "west=-181&east=180&south=-90&north=90",
        WORLD + "&west=0",
        WORLD + "&limit=101",
        WORLD + "&after=-1",
    ],
)
def test_invalid_map_viewports(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch, query: str
) -> None:
    """Reject missing, duplicate, nonfinite, inverted and out-of-range bounds.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.
        query (str): Invalid viewport query.

    Returns:
        None.
    """
    app, conn = backend
    client, _ = create_user(app, conn, "map_bounds", monkeypatch)
    assert client.get(f"/api/map/profiles?{query}").status_code == 422


def test_map_sharing_requires_a_complete_authenticated_account(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Protect settings and browsing, and reject implicit or mistyped consent.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.

    Returns:
        None.
    """
    app, conn = backend
    assert app.test_client().get(f"/api/map/profiles?{WORLD}").status_code == 401
    client, _ = create_user(app, conn, "map_incomplete", monkeypatch)
    assert client.get(f"/api/map/profiles?{WORLD}").status_code == 409
    assert (
        client.put(
            "/api/me/map", json={"map_visible": True, "consent": True}
        ).status_code
        == 409
    )
    for payload in (
        {"map_visible": "true", "consent": True},
        {"map_visible": True, "consent": "true"},
        {"map_visible": True, "consent": False},
    ):
        assert client.put("/api/me/map", json=payload).status_code == 422
    sharing(client, False)
