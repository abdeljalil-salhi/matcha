import io
import random
from http import HTTPStatus

import pytest
from flask import Flask
from PIL import Image
from psycopg import Connection
from pytest import MonkeyPatch

from server.common.config import MAX_FORM_MEMORY_BYTES, MULTIPART_OVERHEAD_BYTES
from server.profiles.limits import MAX_PHOTO_BYTES

from .helpers import create_user


def jpeg_payload(size: int) -> bytes:
    """Build a valid JPEG padded with deterministic multipart-sensitive bytes.

    Args:
        size (int): Requested file size in bytes.

    Returns:
        bytes: JPEG with noisy trailing data to exercise parser chunk boundaries.
    """
    output = io.BytesIO()
    Image.new("RGB", (16, 16), "blue").save(output, format="JPEG")
    content = output.getvalue()
    return content + random.Random(42).randbytes(size - len(content))


@pytest.mark.parametrize("size", [350_000, 6 * 1024 * 1024, MAX_PHOTO_BYTES])
def test_valid_photo_uploads_through_ten_mib(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch, size: int
) -> None:
    """Accept multipart-sensitive files and the inclusive ten-MiB boundary.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.
        size (int): File size submitted through the real multipart parser.

    Returns:
        None.
    """
    app, conn = backend
    client, _ = create_user(app, conn, "photo_limits", monkeypatch)
    response = client.post(
        "/api/me/photos", data={"photo": (io.BytesIO(jpeg_payload(size)), "photo.jpg")}
    )
    assert response.status_code == HTTPStatus.CREATED, response.json
    assert conn.execute("SELECT count(*) AS total FROM photos").fetchone()["total"] == 1


@pytest.mark.parametrize("extra", [1, MULTIPART_OVERHEAD_BYTES + 1])
def test_oversized_photo_upload_returns_explicit_limit(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch, extra: int
) -> None:
    """Enforce file and whole-request limits with a readable HTTP 413 error.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.
        extra (int): Bytes exceeding the ten-MiB photo allowance.

    Returns:
        None.
    """
    app, conn = backend
    client, _ = create_user(app, conn, "photo_oversize", monkeypatch)
    response = client.post(
        "/api/me/photos",
        data={
            "photo": (io.BytesIO(b"x" * (MAX_PHOTO_BYTES + extra)), "large.jpg"),
        },
    )
    assert response.status_code == HTTPStatus.REQUEST_ENTITY_TOO_LARGE
    assert "10 MiB" in response.json["error"]["message"]
    assert conn.execute("SELECT count(*) AS total FROM photos").fetchone()["total"] == 0


def test_multipart_text_memory_remains_bounded(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Keep the form-field memory cap while permitting larger streamed files.

    Args:
        backend (tuple[Flask, Connection]): App and isolated database.
        monkeypatch (MonkeyPatch): Account fixture dependency.

    Returns:
        None.
    """
    app, conn = backend
    client, _ = create_user(app, conn, "photo_fields", monkeypatch)
    response = client.post(
        "/api/me/photos",
        data={
            "photo": (io.BytesIO(jpeg_payload(1000)), "photo.jpg"),
            "text": "x" * (MAX_FORM_MEMORY_BYTES + 1),
        },
    )
    assert response.status_code == HTTPStatus.REQUEST_ENTITY_TOO_LARGE
