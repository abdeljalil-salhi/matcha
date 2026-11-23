from flask import Blueprint, g

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import serialize
from ..common.validation import query_int
from ..common.limits import DEFAULT_PAGE_SIZE, MAX_PAGE_OFFSET, MAX_PAGE_SIZE

ONLINE_WINDOW_SECONDS = 15

routes = Blueprint("conversations", __name__)


@routes.get("/chat")
@signed_in
def conversations() -> dict:
    """List the signed-in user's active conversations.

    Args:
        Query parameters:
            limit (int, optional): Maximum number of results.
            offset (int, optional): Number of results to skip.

    Returns:
        dict: Connected accounts and latest-message summaries.
    """
    return serialize(
        {
            "conversations": db()
            .execute(
                """SELECT u.id, u.username, u.first_name, u.last_name, p.id AS photo_id,
                  m.id AS latest_message_id, m.created_at AS latest_message_at,
                  EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id
                      AND s.expires_at > now()
                      AND s.last_seen > now() - %s * interval '1 second') AS online
           FROM likes l JOIN users u ON u.id = l.target_id
           LEFT JOIN photos p ON p.user_id = u.id AND p.is_primary
           LEFT JOIN LATERAL (
               SELECT id, created_at FROM messages
               WHERE (sender_id, recipient_id) IN ((l.actor_id, u.id), (u.id,
                   l.actor_id))
               ORDER BY id DESC LIMIT 1
           ) m ON true
           WHERE l.actor_id = %s AND is_connected(l.actor_id, u.id)
           ORDER BY m.id DESC NULLS LAST, u.id LIMIT %s OFFSET %s""",
                (
                    ONLINE_WINDOW_SECONDS,
                    g.user_id,
                    query_int("limit", 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
                    query_int("offset", 0, MAX_PAGE_OFFSET, 0),
                ),
            )
            .fetchall()
        }
    )
