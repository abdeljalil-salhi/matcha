import io
from http import HTTPStatus

from flask import Blueprint, Response, g, request, send_file

from ...auth.guard import signed_in
from ...common.db import db, lock_users
from ...common.http import ApiError, rate_limit
from ...common.validation import check_id
from ..image import image_bytes
from ..limits import MAX_PROFILE_PHOTOS, PHOTO_UPLOADS_PER_MINUTE
from ..types import PhotoSummary

routes = Blueprint("photos", __name__)


@routes.post("/me/photos")
@signed_in
def upload_photo() -> tuple[PhotoSummary, int]:
    """Save an uploaded image in a free slot and set a primary if needed.

    Args:
        Multipart request body:
            photo (FileStorage): Uploaded image.

    Returns:
        tuple[PhotoSummary, int]: Photo ID, primary flag, and HTTP 201.
    """
    rate_limit(f"photos:{g.user_id}", PHOTO_UPLOADS_PER_MINUTE)
    uploads = request.files.getlist("photo")
    if len(uploads) != 1 or set(request.files) != {"photo"} or request.form:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Send one multipart file field named photo.",
        )
    content = image_bytes(uploads[0].stream)
    with db().transaction():
        lock_users(g.user_id)
        current = (
            db()
            .execute("SELECT slot FROM photos WHERE user_id = %s", (g.user_id,))
            .fetchall()
        )
        free = set(range(1, MAX_PROFILE_PHOTOS + 1)) - {
            photo["slot"] for photo in current
        }
        if not free:
            raise ApiError(HTTPStatus.CONFLICT, "A profile can hold up to five photos.")
        result = (
            db()
            .execute(
                "INSERT INTO photos (user_id, slot, is_primary, content) "
                "VALUES (%s, %s, %s, %s) RETURNING id, is_primary",
                (g.user_id, min(free), not current, content),
            )
            .fetchone()
        )
    return result, HTTPStatus.CREATED


@routes.put("/me/photos/<int:photo_id>/primary")
@signed_in
def make_primary(photo_id: int) -> tuple[str, int]:
    """Select an owned photo as the profile picture.

    Args:
        Path parameters:
            photo_id (int): Photo ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    with db().transaction():
        lock_users(g.user_id)
        if (
            not db()
            .execute(
                "SELECT 1 FROM photos WHERE user_id = %s AND id = %s",
                (g.user_id, check_id(photo_id)),
            )
            .fetchone()
        ):
            raise ApiError(HTTPStatus.NOT_FOUND, "Photo not found.")
        db().execute(
            "UPDATE photos SET is_primary = false WHERE user_id = %s AND is_primary",
            (g.user_id,),
        )
        db().execute("UPDATE photos SET is_primary = true WHERE id = %s", (photo_id,))
    return "", HTTPStatus.NO_CONTENT


@routes.delete("/me/photos/<int:photo_id>")
@signed_in
def delete_photo(photo_id: int) -> tuple[str, int]:
    """Delete an owned photo and replace the primary photo if needed.

    Args:
        Path parameters:
            photo_id (int): Photo ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    with db().transaction():
        lock_users(g.user_id)
        deleted = (
            db()
            .execute(
                "DELETE FROM photos WHERE user_id = %s AND id = %s "
                "RETURNING is_primary",
                (g.user_id, check_id(photo_id)),
            )
            .fetchone()
        )
        if deleted is None:
            raise ApiError(HTTPStatus.NOT_FOUND, "Photo not found.")
        if deleted["is_primary"]:
            db().execute(
                """UPDATE photos SET is_primary = true WHERE id =
                   (SELECT id FROM photos WHERE user_id = %s ORDER BY slot LIMIT 1)""",
                (g.user_id,),
            )
    return "", HTTPStatus.NO_CONTENT


@routes.get("/photos/<int:photo_id>")
@signed_in
def get_photo(photo_id: int) -> Response:
    """Serve a profile photo that the signed-in user can access.

    Args:
        Path parameters:
            photo_id (int): Photo ID.

    Returns:
        Response: JPEG image response.
    """
    image = (
        db()
        .execute(
            """SELECT content FROM photos WHERE id = %s AND
           (user_id = %s OR (NOT is_blocked(user_id, %s) AND EXISTS
                (SELECT 1 FROM public_profiles WHERE public_profiles.id =
                    photos.user_id)))""",
            (check_id(photo_id), g.user_id, g.user_id),
        )
        .fetchone()
    )
    if image is None:
        raise ApiError(HTTPStatus.NOT_FOUND, "Photo not found.")
    return send_file(
        io.BytesIO(image["content"]), mimetype="image/jpeg", download_name="photo.jpg"
    )
