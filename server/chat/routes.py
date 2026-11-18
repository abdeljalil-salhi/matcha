from http import HTTPStatus
from uuid import UUID

from flask import Blueprint, g

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import ApiError, rate_limit, serialize
from ..notifications.events import notify
from ..relationships.access import connection_required, pair
from .types import MessagePage
from ..common.request_data import object_body, require_string
from ..common.validation import MAX_ID, query_int, text
from ..common.limits import MAX_PAGE_SIZE

MAX_MESSAGE_LENGTH = 2000
DEFAULT_MESSAGE_PAGE_SIZE = 50
CLIENT_MESSAGE_ID_LENGTH = 36
MESSAGES_PER_MINUTE = 60

routes = Blueprint("chat", __name__)


@routes.get("/chat/<int:user_id>/messages")
@signed_in
def messages(user_id: int) -> MessagePage:
    """Read a page of messages for a current mutual connection.

    Args:
        Path parameters:
            user_id (int): Other participant's ID.
        Query parameters:
            before (int, optional): Exclusive ID for older messages.
            after (int, optional): Exclusive ID for newer messages.
            limit (int, optional): Maximum page size.

    Returns:
        MessagePage: Messages in chronological order.
    """
    after = query_int("after", 0, MAX_ID)
    before = query_int("before", 1, MAX_ID)
    limit = query_int("limit", 1, MAX_PAGE_SIZE, DEFAULT_MESSAGE_PAGE_SIZE)
    if after is not None and before is not None:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Use either after or before.")
    with db().transaction():
        pair(user_id)
        connection_required(user_id)
        if after is not None:
            rows = (
                db()
                .execute(
                    """SELECT id, sender_id, recipient_id, client_id::text, body,
                        created_at FROM messages
                   WHERE (sender_id, recipient_id) IN ((%(me)s, %(other)s), (%(other)s,
                       %(me)s))
                     AND id > %(after)s ORDER BY id LIMIT %(limit)s""",
                    {"me": g.user_id, "other": user_id, "after": after, "limit": limit},
                )
                .fetchall()
            )
        else:
            rows = (
                db()
                .execute(
                    """SELECT id, sender_id, recipient_id, client_id::text, body,
                        created_at FROM messages
                   WHERE (sender_id, recipient_id) IN ((%(me)s, %(other)s), (%(other)s,
                       %(me)s))
                     AND id <= %(boundary)s ORDER BY id DESC LIMIT %(limit)s""",
                    {
                        "me": g.user_id,
                        "other": user_id,
                        "boundary": before - 1 if before else MAX_ID,
                        "limit": limit,
                    },
                )
                .fetchall()
            )
            rows.reverse()
    return serialize({"messages": rows})


@routes.post("/chat/<int:user_id>/messages")
@signed_in
def send_message(user_id: int) -> dict | tuple[dict, int]:
    """Send a chat message, reusing the saved result on a valid retry.

    Args:
        Path parameters:
            user_id (int): Recipient ID.
        Request body (JSON):
            body (str): Message text.
            client_id (str): UUID supplied by the client for retries.

    Returns:
        dict | tuple[dict, int]: Existing message or new message with HTTP 201.
    """
    rate_limit(f"message:{g.user_id}", MESSAGES_PER_MINUTE)
    data = object_body("body", "client_id", required=("body", "client_id"))
    body = text(
        require_string(data["body"], "body"), "body", MAX_MESSAGE_LENGTH, multiline=True
    )
    try:
        client_id = UUID(
            text(
                require_string(data["client_id"], "client_id"),
                "client_id",
                CLIENT_MESSAGE_ID_LENGTH,
                CLIENT_MESSAGE_ID_LENGTH,
            )
        )
    except ValueError:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "client_id must be a UUID."
        ) from None
    with db().transaction():
        me, other = pair(user_id)
        connection_required(other)
        row = (
            db()
            .execute(
                """INSERT INTO messages (sender_id, recipient_id, client_id, body)
               VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING
               RETURNING id, sender_id, recipient_id, client_id::text, body,
                   created_at""",
                (me, other, client_id, body),
            )
            .fetchone()
        )
        if row:
            notify(other, me, "message", row["id"])
            return serialize(row), HTTPStatus.CREATED
        row = (
            db()
            .execute(
                """SELECT id, sender_id, recipient_id, client_id::text, body, created_at
                    FROM messages
               WHERE sender_id = %s AND recipient_id = %s AND client_id = %s""",
                (me, other, client_id),
            )
            .fetchone()
        )
        if row["body"] != body:
            raise ApiError(
                HTTPStatus.CONFLICT,
                "That client_id already belongs to a different message.",
            )
        return serialize(row)
