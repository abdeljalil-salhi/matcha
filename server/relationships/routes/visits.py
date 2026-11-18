from http import HTTPStatus

from flask import Blueprint, g

from ...auth.guard import signed_in
from ...common.db import db
from ...common.http import rate_limit, serialize
from ...common.limits import DEFAULT_PAGE_SIZE, MAX_PAGE_OFFSET, MAX_PAGE_SIZE
from ...common.validation import query_int
from ...notifications.events import notify
from ...profiles.visibility import public_profile
from ..access import pair

VISITS_PER_MINUTE = 120
VISIT_NOTIFICATION_COOLDOWN_SECONDS = 60

routes = Blueprint("visits", __name__)


@routes.post("/profiles/<int:user_id>/visits")
@signed_in
def record_visit(user_id: int) -> tuple[str, int]:
    """Record a profile visit and throttle repeat notifications.

    Args:
        Path parameters:
            user_id (int): Visited user's ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    rate_limit(f"visit:{g.user_id}", VISITS_PER_MINUTE)
    with db().transaction():
        me, other = pair(user_id)
        public_profile(other)
        previous = (
            db()
            .execute(
                """SELECT last_notified_at > now() - %s * interval '1 second'
                          AS recent
               FROM visits WHERE viewer_id = %s AND target_id = %s""",
                (VISIT_NOTIFICATION_COOLDOWN_SECONDS, me, other),
            )
            .fetchone()
        )
        db().execute(
            """INSERT INTO visits (viewer_id, target_id) VALUES (%s, %s)
               ON CONFLICT (viewer_id, target_id) DO UPDATE SET last_viewed_at =
                   now()""",
            (me, other),
        )
        if not previous or not previous["recent"]:
            notify(other, me, "visit")
            db().execute(
                "UPDATE visits SET last_notified_at = now() WHERE viewer_id = %s AND "
                "target_id = %s",
                (me, other),
            )
    return "", HTTPStatus.NO_CONTENT


@routes.get("/me/visitors")
@signed_in
def visitors() -> dict:
    """List visible visitors and their most recent visit times.

    Args:
        Query parameters:
            limit (int, optional): Maximum number of results.
            offset (int, optional): Number of results to skip.

    Returns:
        dict: Visitor summaries and visit timestamps.
    """
    return serialize(
        {
            "visitors": db()
            .execute(
                """SELECT u.id, u.username, u.first_name, u.last_name, p.id AS photo_id,
                    v.last_viewed_at
           FROM visits v JOIN users u ON v.viewer_id = u.id
           LEFT JOIN photos p ON p.user_id = u.id AND p.is_primary
           WHERE v.target_id = %s AND NOT is_blocked(u.id, v.target_id)
           ORDER BY v.last_viewed_at DESC, u.id LIMIT %s OFFSET %s""",
                (
                    g.user_id,
                    query_int("limit", 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
                    query_int("offset", 0, MAX_PAGE_OFFSET, 0),
                ),
            )
            .fetchall()
        }
    )
