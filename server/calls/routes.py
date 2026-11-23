from http import HTTPStatus
from uuid import UUID, uuid4

from flask import Blueprint, g, request

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import ApiError, rate_limit, serialize
from ..common.request_data import object_body
from ..common.validation import MAX_ID, query_int
from ..relationships.access import connection_required, pair
from .lifecycle import clean_calls, locked_call, owns_call, public_call
from .limits import (
    CALLS_PER_MINUTE,
    POLL_REQUESTS_PER_MINUTE,
    SIGNAL_PAGE_SIZE,
)
from .validation import identifier

routes = Blueprint("calls", __name__)


@routes.post("/calls")
@signed_in
def start() -> tuple[dict, int]:
    """Reserve both connected users atomically and invite the recipient.

    Returns:
        tuple[dict, int]: Created call snapshot and HTTP 201.
    """
    rate_limit(f"call:start:{g.user_id}", CALLS_PER_MINUTE)
    data = object_body(
        "user_id",
        "mode",
        "device_id",
        required=(
            "user_id",
            "mode",
            "device_id",
        ),
    )
    device = identifier(data["device_id"])
    if type(data["user_id"]) is not int or data["mode"] not in ("audio", "video"):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Invalid call invitation.")
    with db().transaction():
        clean_calls(db())
        me, other = pair(data["user_id"])
        connection_required(other)
        if (
            db()
            .execute(
                "SELECT 1 FROM call_participants WHERE user_id IN (%s, %s)",
                (me, other),
            )
            .fetchone()
        ):
            raise ApiError(HTTPStatus.CONFLICT, "One of you is already in a call.")
        row = (
            db()
            .execute(
                """INSERT INTO calls (id, caller_id, callee_id, caller_session,
                caller_device, mode) VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
                (uuid4(), me, other, g.session_hash, device, data["mode"]),
            )
            .fetchone()
        )
        db().execute(
            "INSERT INTO call_participants (user_id, call_id) "
            "VALUES (%s, %s), (%s, %s)",
            (me, row["id"], other, row["id"]),
        )
        return {"call": public_call(row, device)}, HTTPStatus.CREATED


@routes.get("/calls/current")
@signed_in
def current() -> dict:
    """Discover the current invitation or active call across signed-in pages.

    Returns:
        dict: Call snapshot or null, without media access or heartbeat renewal.
    """
    rate_limit(f"call:poll:{g.user_id}", POLL_REQUESTS_PER_MINUTE)
    device = identifier(request.args.get("device_id"))
    with db().transaction():
        clean_calls(db())
        row = (
            db()
            .execute(
                """SELECT c.* FROM calls c JOIN call_participants p ON p.call_id = c.id
            WHERE p.user_id = %s""",
                (g.user_id,),
            )
            .fetchone()
        )
        return {"call": public_call(row, device) if row else None}


@routes.get("/calls/<uuid:call_id>")
@signed_in
def read(call_id: UUID) -> dict:
    """Read call state and an ordered page of the remote participant's signals.

    Args:
        call_id (UUID): Requested call ID.

    Returns:
        dict: Call snapshot, signals and pagination flag.
    """
    rate_limit(f"call:poll:{g.user_id}", POLL_REQUESTS_PER_MINUTE)
    device = identifier(request.args.get("device_id"))
    after = query_int("after", 0, MAX_ID, 0)
    with db().transaction():
        clean_calls(db())
        row = locked_call(call_id)
        signals = []
        if row["state"] == "active" and owns_call(row, device):
            connection_required(
                row["callee_id"] if row["caller_id"] == g.user_id else row["caller_id"]
            )
            signals = (
                db()
                .execute(
                    """SELECT id, kind, payload FROM call_signals WHERE call_id = %s
                AND sender_id <> %s AND id > %s ORDER BY id LIMIT %s""",
                    (call_id, g.user_id, after, SIGNAL_PAGE_SIZE + 1),
                )
                .fetchall()
            )
        return serialize(
            {
                "call": public_call(row, device),
                "signals": signals[:SIGNAL_PAGE_SIZE],
                "has_more": len(signals) > SIGNAL_PAGE_SIZE,
            }
        )
