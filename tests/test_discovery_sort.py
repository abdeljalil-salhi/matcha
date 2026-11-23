"""Regression coverage for signup-date discovery ordering."""

from http import HTTPStatus

from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from .helpers import create_user
from .profile_helpers import complete


def test_newest_sort_uses_signup_date_and_preserves_visibility(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Check ordering, pagination and blocking for both discovery routes."""
    app, connection = backend
    viewer, viewer_id = create_user(app, connection, "viewer", monkeypatch)
    older, older_id = create_user(app, connection, "older", monkeypatch)
    newer, newer_id = create_user(app, connection, "newer", monkeypatch)
    complete(viewer, "woman", None)
    complete(older, "man", None)
    complete(newer, "man", None)
    connection.execute(
        "UPDATE users SET created_at = now() - interval '5 days' WHERE id = %s",
        (older_id,),
    )
    connection.execute(
        "UPDATE users SET created_at = now() - interval '1 day' WHERE id = %s",
        (newer_id,),
    )
    connection.commit()
    for endpoint in ("suggestions", "search"):
        url = f"/api/discovery/{endpoint}?sort=newest"
        response = viewer.get(url)
        assert response.status_code == HTTPStatus.OK
        assert [item["id"] for item in response.json["profiles"]] == [
            newer_id,
            older_id,
        ]
        assert all("joined_at" not in item for item in response.json["profiles"])
        assert (
            viewer.get(url + "&limit=1&offset=1").json["profiles"][0]["id"] == older_id
        )
        assert viewer.get(url + "&direction=asc").json["profiles"][0]["id"] == older_id
    assert (
        viewer.put(f"/api/profiles/{newer_id}/block").status_code
        == HTTPStatus.NO_CONTENT
    )
    assert [
        item["id"]
        for item in viewer.get("/api/discovery/search?sort=newest").json["profiles"]
    ] == [older_id]
    assert viewer_id not in (older_id, newer_id)
