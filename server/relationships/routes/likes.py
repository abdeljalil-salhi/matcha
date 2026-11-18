from http import HTTPStatus

from flask import Blueprint, g

from ...auth.guard import signed_in
from ...common.db import db
from ...common.http import ApiError, rate_limit, serialize
from ...common.limits import DEFAULT_PAGE_SIZE, MAX_PAGE_OFFSET, MAX_PAGE_SIZE
from ...common.validation import query_int
from ...notifications.events import notify
from ...profiles.visibility import public_profile
from ..access import pair
from ..types import LikeResult

LIKES_PER_MINUTE = 60

routes = Blueprint("likes", __name__)


@routes.put("/profiles/<int:user_id>/like")
@signed_in
def like(user_id: int) -> LikeResult:
    """Like a visible profile and notify the recipient of any new match.

    Args:
        Path parameters:
            user_id (int): Target user ID.

    Returns:
        LikeResult: Whether the pair is now connected.
    """
    rate_limit(f"like:{g.user_id}", LIKES_PER_MINUTE)
    with db().transaction():
        me, other = pair(user_id)
        public_profile(other)
        if (
            not db()
            .execute("SELECT 1 FROM photos WHERE user_id = %s AND is_primary", (me,))
            .fetchone()
        ):
            raise ApiError(
                HTTPStatus.CONFLICT, "Set a profile photo before liking another user."
            )
        created = (
            db()
            .execute(
                "INSERT INTO likes (actor_id, target_id) VALUES (%s, %s) ON CONFLICT "
                "DO NOTHING RETURNING actor_id",
                (me, other),
            )
            .fetchone()
        )
        db().execute(
            "DELETE FROM mutes WHERE actor_id = %s AND target_id = %s", (me, other)
        )
        connected = (
            db()
            .execute("SELECT is_connected(%s, %s) AS value", (me, other))
            .fetchone()["value"]
        )
        if created:
            notify(other, me, "like")
            if connected:
                notify(other, me, "match")
    return {"connected": connected}


@routes.delete("/profiles/<int:user_id>/like")
@signed_in
def unlike(user_id: int) -> tuple[str, int]:
    """Remove a like, mute the target's events, and end any connection.

    Args:
        Path parameters:
            user_id (int): Target user ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    rate_limit(f"like:{g.user_id}", LIKES_PER_MINUTE)
    with db().transaction():
        me, other = pair(user_id)
        connected = (
            db()
            .execute("SELECT is_connected(%s, %s) AS value", (me, other))
            .fetchone()["value"]
        )
        deleted = (
            db()
            .execute(
                "DELETE FROM likes WHERE actor_id = %s AND target_id = %s RETURNING "
                "actor_id",
                (me, other),
            )
            .fetchone()
        )
        if deleted:
            db().execute(
                "INSERT INTO mutes VALUES (%s, %s) ON CONFLICT DO NOTHING", (me, other)
            )
            db().execute(
                "DELETE FROM notifications WHERE recipient_id = %s AND actor_id = %s "
                "AND read_at IS NULL",
                (me, other),
            )
            if connected:
                notify(other, me, "unlike")
    return "", HTTPStatus.NO_CONTENT


@routes.get("/me/likes")
@signed_in
def received_likes() -> dict:
    """List incoming likes visible to the signed-in user.

    Args:
        Query parameters:
            limit (int, optional): Maximum number of results.
            offset (int, optional): Number of results to skip.

    Returns:
        dict: Incoming likes with account summaries.
    """
    return serialize(
        {
            "likes": db()
            .execute(
                """SELECT u.id, u.username, u.first_name, u.last_name, p.id AS photo_id,
                    l.created_at,
                  is_connected(u.id, l.target_id) AS connected
           FROM likes l JOIN users u ON l.actor_id = u.id
           LEFT JOIN photos p ON p.user_id = u.id AND p.is_primary
           WHERE l.target_id = %s AND NOT is_blocked(u.id, l.target_id)
           ORDER BY l.created_at DESC, u.id LIMIT %s OFFSET %s""",
                (
                    g.user_id,
                    query_int("limit", 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
                    query_int("offset", 0, MAX_PAGE_OFFSET, 0),
                ),
            )
            .fetchall()
        }
    )
