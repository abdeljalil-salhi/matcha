from http import HTTPStatus
from uuid import UUID

from flask import Blueprint, g, request

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import ApiError, rate_limit, serialize
from ..common.limits import MAX_PAGE_SIZE
from ..common.request_data import object_body, require_string
from ..common.validation import MAX_ID, query_int, text
from ..notifications.events import notify
from ..relationships.access import connection_required, pair
from .giphy import GIPHY_DEFAULT_LIMIT, GIPHY_MAX_LIMIT, allowed_giphy_url, search_gifs
from .types import MessagePage

MAX_MESSAGE_LENGTH = 2000
MAX_MEDIA_URL_LENGTH = 2048
MAX_MEDIA_ALT_LENGTH = 200
DEFAULT_MESSAGE_PAGE_SIZE = 50
CLIENT_MESSAGE_ID_LENGTH = 36
MESSAGES_PER_MINUTE = 60
GIF_SEARCHES_PER_MINUTE = 30
MESSAGE_COLUMNS = """id, sender_id, recipient_id, client_id::text, kind, body,
    media_url, media_alt, created_at"""

routes = Blueprint("chat", __name__)


@routes.get("/chat/gifs")
@signed_in
def gifs() -> dict:
    """Search GIFs for the chat picker through the server-side GIPHY proxy.

    Args:
        Query parameters:
            q (str): Search term.
            limit (int, optional): Maximum number of results.

    Returns:
        dict: Normalized GIF picker options.
    """
    rate_limit(f"gif-search:{g.user_id}", GIF_SEARCHES_PER_MINUTE)
    query = request.args.get("q")
    if query is None:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "q is required.")
    query = text(query, "q", 80)
    limit = query_int("limit", 1, GIPHY_MAX_LIMIT, GIPHY_DEFAULT_LIMIT)
    return {"gifs": search_gifs(query, limit)}


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
                    f"""SELECT {MESSAGE_COLUMNS} FROM messages
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
                    f"""SELECT {MESSAGE_COLUMNS} FROM messages
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
        incoming = [row["id"] for row in rows if row["recipient_id"] == g.user_id]
        if incoming:
            db().execute(
                """INSERT INTO chat_receipts
                   (recipient_id, sender_id, delivered_through)
                   VALUES (%s, %s, %s) ON CONFLICT (recipient_id, sender_id)
                   DO UPDATE SET delivered_through = greatest(
                       chat_receipts.delivered_through, excluded.delivered_through)""",
                (g.user_id, user_id, max(incoming)),
            )
        receipt = (
            db()
            .execute(
                """SELECT delivered_through, read_through FROM chat_receipts
               WHERE recipient_id = %s AND sender_id = %s""",
                (user_id, g.user_id),
            )
            .fetchone()
        )
    return serialize(
        {
            "messages": rows,
            "receipts": receipt
            or {
                "delivered_through": 0,
                "read_through": 0,
            },
        }
    )


def _client_id(data: dict) -> UUID:
    try:
        return UUID(
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


def _message_payload(data: dict) -> dict:
    kind = "text"
    if "kind" in data:
        kind = text(require_string(data["kind"], "kind"), "kind", 4, 3)
    if kind not in {"text", "gif"}:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "kind must be text or gif.")

    body = ""
    if "body" in data:
        body = text(
            require_string(data["body"], "body"),
            "body",
            MAX_MESSAGE_LENGTH,
            minimum=0,
            multiline=True,
        )

    media_url = None
    media_alt = None
    if kind == "text":
        if not body.strip():
            raise ApiError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "body has an invalid length or character.",
            )
        body = body.strip()
        if "media_url" in data or "media_alt" in data:
            raise ApiError(
                HTTPStatus.UNPROCESSABLE_ENTITY, "Text messages cannot include media."
            )
    else:
        body = body.strip()
        media_url = allowed_giphy_url(
            text(
                require_string(data.get("media_url"), "media_url"),
                "media_url",
                MAX_MEDIA_URL_LENGTH,
            )
        )
        if not media_url:
            raise ApiError(
                HTTPStatus.UNPROCESSABLE_ENTITY, "media_url must be a GIPHY media URL."
            )
        if "media_alt" in data and data["media_alt"] is not None:
            media_alt = (
                text(
                    require_string(data["media_alt"], "media_alt"),
                    "media_alt",
                    MAX_MEDIA_ALT_LENGTH,
                    minimum=0,
                ).strip()
                or None
            )

    return {
        "kind": kind,
        "body": body,
        "media_url": media_url,
        "media_alt": media_alt,
    }


@routes.post("/chat/<int:user_id>/messages")
@signed_in
def send_message(user_id: int) -> dict | tuple[dict, int]:
    """Send a chat message, reusing the saved result on a valid retry.

    Args:
        Path parameters:
            user_id (int): Recipient ID.
        Request body (JSON):
            body (str): Message text or optional caption.
            client_id (str): UUID supplied by the client for retries.
            kind (str, optional): "text" or "gif".
            media_url (str, optional): Allowed GIPHY media URL for GIFs.
            media_alt (str, optional): Accessible GIF description.

    Returns:
        dict | tuple[dict, int]: Existing message or new message with HTTP 201.
    """
    rate_limit(f"message:{g.user_id}", MESSAGES_PER_MINUTE)
    data = object_body(
        "body",
        "client_id",
        "kind",
        "media_url",
        "media_alt",
        required=("client_id",),
    )
    client_id = _client_id(data)
    payload = _message_payload(data)
    with db().transaction():
        me, other = pair(user_id)
        connection_required(other)
        row = (
            db()
            .execute(
                f"""INSERT INTO messages (sender_id, recipient_id, client_id, kind,
                       body, media_url, media_alt)
               VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
               RETURNING {MESSAGE_COLUMNS}""",
                (
                    me,
                    other,
                    client_id,
                    payload["kind"],
                    payload["body"],
                    payload["media_url"],
                    payload["media_alt"],
                ),
            )
            .fetchone()
        )
        if row:
            notify(other, me, "message", row["id"])
            return serialize(row), HTTPStatus.CREATED
        row = (
            db()
            .execute(
                f"""SELECT {MESSAGE_COLUMNS} FROM messages
               WHERE sender_id = %s AND recipient_id = %s AND client_id = %s""",
                (me, other, client_id),
            )
            .fetchone()
        )
        if (
            row["kind"] != payload["kind"]
            or row["body"] != payload["body"]
            or row["media_url"] != payload["media_url"]
            or row["media_alt"] != payload["media_alt"]
        ):
            raise ApiError(
                HTTPStatus.CONFLICT,
                "That client_id already belongs to a different message.",
            )
        return serialize(row)


@routes.put("/chat/<int:user_id>/read")
@signed_in
def read_messages(user_id: int) -> tuple[str, int]:
    """Acknowledge incoming messages through the latest displayed message."""
    data = object_body("through")
    through = data.get("through")
    if type(through) is not int or not 1 <= through <= MAX_ID:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "through must be a message ID.")
    with db().transaction():
        pair(user_id)
        connection_required(user_id)
        row = (
            db()
            .execute(
                """SELECT max(id) AS through FROM messages
               WHERE recipient_id = %s AND sender_id = %s AND id <= %s""",
                (g.user_id, user_id, through),
            )
            .fetchone()
        )
        if row["through"]:
            db().execute(
                """INSERT INTO chat_receipts
                   (recipient_id, sender_id, delivered_through, read_through)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (recipient_id, sender_id) DO UPDATE SET
                   delivered_through = greatest(chat_receipts.delivered_through,
                       excluded.delivered_through),
                   read_through = greatest(chat_receipts.read_through,
                       excluded.read_through)""",
                (g.user_id, user_id, row["through"], row["through"]),
            )
    return "", HTTPStatus.NO_CONTENT
