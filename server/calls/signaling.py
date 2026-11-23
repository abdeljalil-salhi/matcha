from http import HTTPStatus
from uuid import UUID

from flask import Blueprint, g
from psycopg.types.json import Jsonb

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import ApiError, rate_limit
from ..common.request_data import object_body
from ..relationships.access import connection_required
from .lifecycle import clean_calls, locked_call, require_owner
from .limits import MAX_SIGNALS, SIGNALS_PER_MINUTE
from .validation import identifier, signal_payload

routes = Blueprint("call_signals", __name__)


@routes.post("/calls/<uuid:call_id>/signals")
@signed_in
def signal(call_id: UUID) -> tuple[dict, int]:
    """Store bounded, idempotent WebRTC setup messages for the remote owner.

    Args:
        call_id (UUID): Requested call ID.

    Returns:
        tuple[dict, int]: Signal acknowledgement with HTTP 200 or 201.
    """
    rate_limit(f"call:signal:{g.user_id}", SIGNALS_PER_MINUTE)
    data = object_body(
        "device_id",
        "client_id",
        "kind",
        "payload",
        required=(
            "device_id",
            "client_id",
            "kind",
            "payload",
        ),
    )
    device, client = identifier(data["device_id"]), identifier(data["client_id"])
    kind = data["kind"]
    payload = signal_payload(kind, data["payload"])
    with db().transaction():
        clean_calls(db())
        row = locked_call(call_id)
        require_owner(row, device)
        connection_required(
            row["callee_id"] if row["caller_id"] == g.user_id else row["caller_id"]
        )
        if row["state"] != "active":
            raise ApiError(HTTPStatus.CONFLICT, "This call is not active.")
        existing = (
            db()
            .execute(
                "SELECT id, kind, payload FROM call_signals "
                "WHERE call_id = %s AND sender_id = %s AND client_id = %s",
                (call_id, g.user_id, client),
            )
            .fetchone()
        )
        if existing:
            if existing["kind"] != kind or existing["payload"] != payload:
                raise ApiError(HTTPStatus.CONFLICT, "Signal retry does not match.")
            return {"id": existing["id"]}, HTTPStatus.OK
        if kind in ("offer", "answer"):
            expected = row["caller_id"] if kind == "offer" else row["callee_id"]
            if g.user_id != expected:
                raise ApiError(HTTPStatus.FORBIDDEN, "Invalid signaling role.")
            if (
                db()
                .execute(
                    "SELECT 1 FROM call_signals WHERE call_id = %s AND kind = %s",
                    (call_id, kind),
                )
                .fetchone()
            ):
                raise ApiError(HTTPStatus.CONFLICT, "Description already sent.")
            if (
                kind == "answer"
                and not db()
                .execute(
                    "SELECT 1 FROM call_signals WHERE call_id = %s AND kind = 'offer'",
                    (call_id,),
                )
                .fetchone()
            ):
                raise ApiError(HTTPStatus.CONFLICT, "An offer is required first.")
        count = (
            db()
            .execute(
                "SELECT count(*) AS n FROM call_signals WHERE call_id = %s",
                (call_id,),
            )
            .fetchone()["n"]
        )
        if count >= MAX_SIGNALS:
            raise ApiError(HTTPStatus.TOO_MANY_REQUESTS, "Too many call signals.")
        saved = (
            db()
            .execute(
                "INSERT INTO call_signals "
                "(call_id, sender_id, client_id, kind, payload) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (call_id, g.user_id, client, kind, Jsonb(payload)),
            )
            .fetchone()
        )
        return {"id": saved["id"]}, HTTPStatus.CREATED
