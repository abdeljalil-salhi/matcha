from http import HTTPStatus

from flask import g

from ..common.db import db, lock_users
from ..common.http import ApiError
from ..common.validation import check_id


def pair(other: int) -> tuple[int, int]:
    """Lock the signed-in user and another account for a pair operation.

    Args:
        other (int): Other user's ID.

    Returns:
        tuple[int, int]: Signed-in user's ID and other user's ID.
    """
    check_id(other)
    if other == g.user_id:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "This operation requires another account."
        )
    if len(lock_users(g.user_id, other)) != 2:
        raise ApiError(HTTPStatus.NOT_FOUND, "Profile not found.")
    return g.user_id, other


def connection_required(other: int) -> None:
    """Require an unblocked mutual connection for chat.

    Args:
        other (int): Other user's ID.

    Returns:
        None.
    """
    if (
        not db()
        .execute("SELECT is_connected(%s, %s) AS allowed", (g.user_id, check_id(other)))
        .fetchone()["allowed"]
    ):
        raise ApiError(
            HTTPStatus.FORBIDDEN, "Chat requires a current mutual connection."
        )
