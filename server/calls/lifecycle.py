from http import HTTPStatus
from uuid import UUID

from flask import g
from psycopg import Connection

from ..common.db import db, lock_users
from ..common.http import ApiError
from .limits import (
    HEARTBEAT_SECONDS,
    MAX_CALL_SECONDS,
    RING_SECONDS,
    SIGNAL_RETENTION_DAYS,
)


def clean_calls(connection: Connection) -> None:
    """Expire abandoned calls and erase signaling data after termination.

    Args:
        connection (Connection): Request or background-worker connection.

    Returns:
        None.
    """
    connection.execute(
        """WITH stale AS (
          SELECT c.id FROM calls c WHERE state IN ('ringing', 'active') AND (
            NOT is_connected(caller_id, callee_id)
            OR created_at < now() - %s * interval '1 second'
            OR NOT EXISTS (SELECT 1 FROM sessions s WHERE
                s.token_hash = c.caller_session AND s.expires_at > now())
            OR (state = 'ringing' AND created_at < now() - %s * interval '1 second')
            OR (state = 'active' AND NOT EXISTS (SELECT 1 FROM sessions s WHERE
                s.token_hash = c.callee_session AND s.expires_at > now()))
            OR EXISTS (SELECT 1 FROM call_participants p WHERE p.call_id = c.id
                AND (p.user_id = c.caller_id OR c.state = 'active')
                AND p.heartbeat_at < now() - %s * interval '1 second')
          ) FOR UPDATE OF c SKIP LOCKED
        ) UPDATE calls c SET state = CASE WHEN state = 'ringing' THEN 'missed'
            ELSE 'ended' END, ended_at = now() FROM stale WHERE c.id = stale.id""",
        (MAX_CALL_SECONDS, RING_SECONDS, HEARTBEAT_SECONDS),
    )
    connection.execute(
        "DELETE FROM call_participants p USING calls c WHERE p.call_id = c.id "
        "AND c.state NOT IN ('ringing', 'active')"
    )
    connection.execute(
        "DELETE FROM call_signals s USING calls c WHERE s.call_id = c.id "
        "AND c.state NOT IN ('ringing', 'active')"
    )
    connection.execute(
        "DELETE FROM calls WHERE ended_at < now() - %s * interval '1 day'",
        (SIGNAL_RETENTION_DAYS,),
    )


def locked_call(call_id: UUID) -> dict:
    """Lock participants before their call and hide calls from nonparticipants.

    Args:
        call_id (UUID): Requested call.

    Returns:
        dict: Locked call row, including private ownership fields.
    """
    row = (
        db()
        .execute(
            "SELECT * FROM calls WHERE id = %s AND %s IN (caller_id, callee_id)",
            (call_id, g.user_id),
        )
        .fetchone()
    )
    if row is None:
        raise ApiError(HTTPStatus.NOT_FOUND, "Call not found.")
    lock_users(row["caller_id"], row["callee_id"])
    locked = (
        db()
        .execute("SELECT * FROM calls WHERE id = %s FOR UPDATE", (call_id,))
        .fetchone()
    )
    if locked is None:
        raise ApiError(HTTPStatus.NOT_FOUND, "Call not found.")
    return locked


def owns_call(row: dict, device: UUID) -> bool:
    """Check the session and browser instance controlling this side of a call.

    Args:
        row (dict): Call record.
        device (UUID): Browser-instance ID.

    Returns:
        bool: Whether this request owns its participant's media session.
    """
    side = "caller" if row["caller_id"] == g.user_id else "callee"
    return row[f"{side}_device"] == device and row[f"{side}_session"] == g.session_hash


def finish(row: dict, state: str) -> None:
    """Release busy slots and remove private signaling when a call ends.

    Args:
        row (dict): Locked call.
        state (str): Terminal state chosen by the action handler.

    Returns:
        None.
    """
    db().execute(
        "UPDATE calls SET state = %s, ended_at = now() WHERE id = %s",
        (state, row["id"]),
    )
    db().execute("DELETE FROM call_participants WHERE call_id = %s", (row["id"],))
    db().execute("DELETE FROM call_signals WHERE call_id = %s", (row["id"],))
    row["state"] = state


def public_call(row: dict, device: UUID) -> dict:
    """Serialize only public call metadata and the other participant's summary.

    Args:
        row (dict): Call row.
        device (UUID): Current browser instance.

    Returns:
        dict: Safe call snapshot; no session hashes or device identifiers.
    """
    other = row["callee_id"] if row["caller_id"] == g.user_id else row["caller_id"]
    peer = (
        db()
        .execute(
            """SELECT u.id, u.username, u.first_name, u.last_name, p.id AS photo_id
        FROM users u LEFT JOIN photos p ON p.user_id = u.id AND p.is_primary
        WHERE u.id = %s""",
            (other,),
        )
        .fetchone()
    )
    return {
        "id": str(row["id"]),
        "mode": row["mode"],
        "state": row["state"],
        "role": "caller" if row["caller_id"] == g.user_id else "callee",
        "owned": owns_call(row, device),
        "peer": peer,
        "created_at": row["created_at"].isoformat(),
    }


def require_owner(row: dict, device: UUID) -> None:
    """Reject signaling and heartbeat attempts from another tab or session.

    Args:
        row (dict): Locked call.
        device (UUID): Browser instance.

    Returns:
        None.
    """
    if not owns_call(row, device):
        raise ApiError(HTTPStatus.CONFLICT, "This call is controlled in another tab.")
