from http import HTTPStatus

from flask import Blueprint, g

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import ApiError, serialize
from ..common.request_data import object_body
from ..common.validation import MAX_ID, check_id, query_int
from .types import NotificationPage
from .inbox import inbox_page, unread_counts
from ..common.limits import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

routes = Blueprint("notifications", __name__)


@routes.get("/notifications")
@signed_in
def notifications() -> NotificationPage:
    """List visible notifications and count unread items.

    Args:
        Query parameters:
            before (int, optional): Exclusive notification ID.
            limit (int, optional): Maximum page size.

    Returns:
        NotificationPage: Notification page and unread totals.
    """
    limit = query_int("limit", 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE)
    before = query_int("before", 1, MAX_ID)
    with db().transaction():
        db().execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        unread = unread_counts(g.user_id)
        entries = inbox_page(g.user_id, before - 1 if before else MAX_ID, limit)
    return serialize({"unread": unread, "notifications": entries})


@routes.put("/notifications/<int:notification_id>/read")
@signed_in
def mark_notification(notification_id: int) -> tuple[str, int]:
    """Mark an actor/type group read through the supplied visible notification ID.

    Args:
        Path parameters:
            notification_id (int): Notification ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    notification_id = check_id(notification_id)
    with db().transaction():
        anchor = (
            db()
            .execute(
                """SELECT id, actor_id, kind FROM visible_notifications
               WHERE id = %s AND recipient_id = %s""",
                (notification_id, g.user_id),
            )
            .fetchone()
        )
        if anchor is None:
            raise ApiError(HTTPStatus.NOT_FOUND, "Notification not found.")
        db().execute(
            """UPDATE notifications SET read_at = coalesce(read_at, now())
               WHERE recipient_id = %(recipient)s AND id <= %(through)s
                 AND kind = %(kind)s AND actor_id = %(actor)s
                 AND id IN (SELECT id FROM visible_notifications
                            WHERE recipient_id = %(recipient)s)""",
            {
                "recipient": g.user_id,
                "through": anchor["id"],
                "actor": anchor["actor_id"],
                "kind": anchor["kind"],
            },
        )
    return "", HTTPStatus.NO_CONTENT


@routes.put("/notifications/read")
@signed_in
def mark_notifications() -> tuple[str, int]:
    """Mark visible notifications read through an inclusive ID.

    Args:
        Request body (JSON):
            through (int): Inclusive upper notification ID.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    data = object_body("through", required=("through",))
    through = data["through"]
    if type(through) is not int or not 1 <= through <= MAX_ID:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "through must be a positive notification ID.",
        )
    db().execute(
        """UPDATE notifications SET read_at = now()
           WHERE recipient_id = %s AND id <= %s AND read_at IS NULL
             AND id IN (SELECT id FROM visible_notifications WHERE recipient_id =
                 %s)""",
        (g.user_id, through, g.user_id),
    )
    return "", HTTPStatus.NO_CONTENT


@routes.post("/presence")
@signed_in
def presence() -> tuple[str, int]:
    """Refresh presence through the session guard.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    return "", HTTPStatus.NO_CONTENT
