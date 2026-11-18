from http import HTTPStatus

from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch

from server.profiles.limits import MAX_PROFILE_PHOTOS

from .helpers import create_user, login
from .profile_helpers import upload
from .security_helpers import competing_requests, synchronize_user_locks


def test_competing_uploads_respect_the_photo_cap(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Compete for the final photo slot and preserve the primary photo.

    Args:
        backend (tuple[Flask, Connection]): Test app and database.
        monkeypatch (MonkeyPatch): SMTP and request synchronization fixture.

    Returns:
        None.
    """
    app, conn = backend
    first, user_id = create_user(app, conn, "photo_race", monkeypatch)
    second = app.test_client()
    assert login(second, "photo_race").status_code == HTTPStatus.OK
    original = []
    for _ in range(MAX_PROFILE_PHOTOS - 1):
        response = upload(first)
        assert response.status_code == HTTPStatus.CREATED
        original.append(response.json)
    with monkeypatch.context() as locks:
        synchronize_user_locks(locks, "server.profiles.routes.photos.lock_users")
        responses = competing_requests(lambda: upload(first), lambda: upload(second))

    assert sorted(response.status_code for response in responses) == [
        HTTPStatus.CREATED,
        HTTPStatus.CONFLICT,
    ]
    added = next(
        response.json
        for response in responses
        if response.status_code == HTTPStatus.CREATED
    )
    assert added["is_primary"] is False
    rows = conn.execute(
        "SELECT id, slot, is_primary FROM photos WHERE user_id = %s ORDER BY slot",
        (user_id,),
    ).fetchall()
    assert len(rows) == MAX_PROFILE_PHOTOS
    assert [row["slot"] for row in rows] == list(range(1, MAX_PROFILE_PHOTOS + 1))
    assert {row["id"] for row in rows} == {
        added["id"],
        *(photo["id"] for photo in original),
    }
    assert [row["id"] for row in rows if row["is_primary"]] == [original[0]["id"]]
    assert len(first.get("/api/me").json["photos"]) == MAX_PROFILE_PHOTOS
