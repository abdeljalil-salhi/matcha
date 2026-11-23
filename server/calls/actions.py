from http import HTTPStatus
from uuid import UUID

from flask import Blueprint, g

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import ApiError, rate_limit
from ..common.request_data import object_body
from ..relationships.access import connection_required
from .lifecycle import clean_calls, finish, locked_call, public_call, require_owner
from .validation import identifier

routes = Blueprint("call_actions", __name__)


@routes.post("/calls/<uuid:call_id>/action")
@signed_in
def action(call_id: UUID) -> dict:
    """Accept, decline, cancel or end a call, enforcing roles and ownership.

    Args:
        call_id (UUID): Requested call ID.

    Returns:
        dict: Updated call snapshot.
    """
    rate_limit(f"call:action:{g.user_id}", 120)
    data = object_body("action", "device_id", required=("action", "device_id"))
    device = identifier(data["device_id"])
    command = data["action"]
    if command not in ("accept", "decline", "cancel", "end", "fail"):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Invalid call action.")
    with db().transaction():
        clean_calls(db())
        row = locked_call(call_id)
        if row["state"] not in ("ringing", "active"):
            return {"call": public_call(row, device)}
        if command == "accept":
            if row["callee_id"] != g.user_id:
                raise ApiError(HTTPStatus.FORBIDDEN, "Only the recipient can accept.")
            connection_required(row["caller_id"])
            if row["state"] == "active":
                require_owner(row, device)
            else:
                row = (
                    db()
                    .execute(
                        """UPDATE calls SET state = 'active', accepted_at = now(),
                        callee_session = %s, callee_device = %s WHERE id = %s
                        RETURNING *""",
                        (g.session_hash, device, call_id),
                    )
                    .fetchone()
                )
                db().execute(
                    "UPDATE call_participants SET heartbeat_at = now() "
                    "WHERE call_id = %s AND user_id = %s",
                    (call_id, g.user_id),
                )
        elif command == "decline":
            if row["callee_id"] != g.user_id or row["state"] != "ringing":
                raise ApiError(
                    HTTPStatus.CONFLICT, "This invitation cannot be declined."
                )
            finish(row, "declined")
        else:
            if command == "cancel" and (
                row["caller_id"] != g.user_id or row["state"] != "ringing"
            ):
                raise ApiError(
                    HTTPStatus.CONFLICT, "This invitation cannot be canceled."
                )
            if command == "fail":
                require_owner(row, device)
            finish(row, "failed" if command == "fail" else "ended")
        return {"call": public_call(row, device)}


@routes.post("/calls/<uuid:call_id>/heartbeat")
@signed_in
def heartbeat(call_id: UUID) -> dict:
    """Renew only the controlling browser's lease for a live call.

    Args:
        call_id (UUID): Requested call ID.

    Returns:
        dict: Call state after renewal or expiry.
    """
    rate_limit(f"call:heartbeat:{g.user_id}", 30)
    device = identifier(object_body("device_id", required=("device_id",))["device_id"])
    with db().transaction():
        clean_calls(db())
        row = locked_call(call_id)
        require_owner(row, device)
        if row["state"] in ("ringing", "active"):
            db().execute(
                "UPDATE call_participants SET heartbeat_at = now() "
                "WHERE user_id = %s AND call_id = %s",
                (g.user_id, call_id),
            )
        return {"call": public_call(row, device)}
