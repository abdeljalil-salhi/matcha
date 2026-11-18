from http import HTTPStatus

from flask import Blueprint, g

from ...auth.guard import signed_in
from ...common.db import db
from ...common.http import rate_limit
from ...common.limits import DEFAULT_PAGE_SIZE, MAX_PAGE_OFFSET, MAX_PAGE_SIZE
from ...common.validation import query_int
from ...profiles.visibility import public_profile
from ..access import pair
from ..types import BlockList

REPORTS_PER_MINUTE = 20

routes = Blueprint("moderation", __name__)


@routes.put("/profiles/<int:user_id>/block")
@signed_in
def block(user_id: int) -> tuple[str, int]:
    """Block a user and clear likes and notifications between the pair.

    Args:
        Path parameters:
            user_id (int): Target user ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    with db().transaction():
        me, other = pair(user_id)
        db().execute(
            "INSERT INTO blocks VALUES (%s, %s) ON CONFLICT DO NOTHING", (me, other)
        )
        db().execute(
            """DELETE FROM likes WHERE (actor_id, target_id) IN ((%(me)s, %(other)s),
                (%(other)s, %(me)s))""",
            {"me": me, "other": other},
        )
        db().execute(
            """DELETE FROM notifications WHERE (recipient_id, actor_id)
               IN ((%(me)s, %(other)s), (%(other)s, %(me)s))""",
            {"me": me, "other": other},
        )
    return "", HTTPStatus.NO_CONTENT


@routes.delete("/profiles/<int:user_id>/block")
@signed_in
def unblock(user_id: int) -> tuple[str, int]:
    """Remove a block placed by the signed-in user.

    Args:
        Path parameters:
            user_id (int): Target user ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    with db().transaction():
        me, other = pair(user_id)
        db().execute(
            "DELETE FROM blocks WHERE actor_id = %s AND target_id = %s", (me, other)
        )
    return "", HTTPStatus.NO_CONTENT


@routes.get("/me/blocks")
@signed_in
def list_blocks() -> BlockList:
    """List accounts blocked by the signed-in user.

    Args:
        Query parameters:
            limit (int, optional): Maximum number of results.
            offset (int, optional): Number of results to skip.

    Returns:
        BlockList: Blocked users' IDs and usernames.
    """
    return {
        "blocks": db()
        .execute(
            """SELECT u.id, u.username FROM blocks b JOIN users u ON u.id = b.target_id
           WHERE b.actor_id = %s ORDER BY u.username LIMIT %s OFFSET %s""",
            (
                g.user_id,
                query_int("limit", 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
                query_int("offset", 0, MAX_PAGE_OFFSET, 0),
            ),
        )
        .fetchall()
    }


@routes.put("/profiles/<int:user_id>/report")
@signed_in
def report(user_id: int) -> tuple[str, int]:
    """Record a fake-account report once per reporter and target.

    Args:
        Path parameters:
            user_id (int): Reported user's ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    rate_limit(f"report:{g.user_id}", REPORTS_PER_MINUTE)
    with db().transaction():
        me, other = pair(user_id)
        public_profile(other)
        db().execute(
            "INSERT INTO reports (actor_id, target_id) VALUES (%s, %s) ON CONFLICT DO "
            "NOTHING",
            (me, other),
        )
    return "", HTTPStatus.NO_CONTENT
