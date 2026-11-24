from ..common.db import db
from ..common.types import JsonObject
from .types import UnreadCounts

# Group before pagination so a conversation cannot occupy several page slots.
GROUPED_INBOX = """
WITH ranked AS (
    SELECT id, actor_id, actor_username, kind, message_id, created_at, read_at,
           row_number() OVER inbox_group AS position,
           count(*) FILTER (WHERE read_at IS NULL) OVER inbox_group AS unread_count
    FROM visible_notifications
    WHERE recipient_id = %(recipient)s
    WINDOW inbox_group AS (
        PARTITION BY kind, actor_id
        ORDER BY id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    )
), grouped AS (
    SELECT id, actor_id, actor_username, kind, message_id, created_at,
           CASE WHEN unread_count > 0 THEN NULL ELSE read_at END AS read_at,
           unread_count
    FROM ranked WHERE position = 1
)
"""


def unread_counts(recipient: int) -> UnreadCounts:
    """Count unread inbox rows and individual unread message events.

    Args:
        recipient (int): Signed-in notification recipient.

    Returns:
        UnreadCounts: Grouped bell count and individual message count.
    """
    return (
        db()
        .execute(
            GROUPED_INBOX + """
        SELECT count(*) FILTER (WHERE unread_count > 0) AS total,
               coalesce(sum(unread_count) FILTER (
                   WHERE kind IN ('message', 'plan')), 0)::bigint
                   AS messages
        FROM grouped""",
            {"recipient": recipient},
        )
        .fetchone()
    )


def inbox_page(recipient: int, boundary: int, limit: int) -> list[JsonObject]:
    """Read the latest event for each actor and notification type.

    Args:
        recipient (int): Signed-in notification recipient.
        boundary (int): Inclusive latest-event ID boundary for pagination.
        limit (int): Maximum grouped rows to return.

    Returns:
        list[JsonObject]: Grouped rows ordered by latest notification ID.
    """
    return (
        db()
        .execute(
            GROUPED_INBOX + """
        SELECT id, actor_id, actor_username, kind, message_id, created_at,
               read_at, unread_count
        FROM grouped WHERE id <= %(boundary)s ORDER BY id DESC LIMIT %(limit)s""",
            {"recipient": recipient, "boundary": boundary, "limit": limit},
        )
        .fetchall()
    )
