from http import HTTPStatus

from flask import g

from ..common.db import db
from ..common.http import ApiError
from ..common.validation import check_id
from .types import PhotoSummary


def photo_list(user_id: int) -> list[PhotoSummary]:
    """List a user's photos in slot order.

    Args:
        user_id (int): Photo owner's ID.

    Returns:
        list[PhotoSummary]: Photo IDs and primary flags.
    """
    return (
        db()
        .execute(
            "SELECT id, is_primary FROM photos WHERE user_id = %s ORDER BY slot",
            (user_id,),
        )
        .fetchall()
    )


def public_profile(user_id: int) -> dict:
    """Fetch a complete profile that is visible to the signed-in user.

    Args:
        user_id (int): Profile owner's ID.

    Returns:
        dict: Public profile fields.
    """
    profile = (
        db()
        .execute(
            "SELECT * FROM public_profiles WHERE id = %s AND NOT is_blocked(%s, id)",
            (check_id(user_id), g.user_id),
        )
        .fetchone()
    )
    if profile is None:
        raise ApiError(HTTPStatus.NOT_FOUND, "Profile not found.")
    return profile
