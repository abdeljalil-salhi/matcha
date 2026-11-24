from datetime import UTC, datetime
from http import HTTPStatus

from flask import Blueprint, g

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import ApiError, rate_limit, serialize
from ..common.limits import DEFAULT_PAGE_SIZE, MAX_PAGE_OFFSET, MAX_PAGE_SIZE
from ..common.request_data import object_body
from ..common.validation import check_id, query_int
from ..notifications.events import notify
from ..relationships.access import connection_required, pair
from .lifecycle import record_history
from .validation import DETAIL_FIELDS, details, request_id, require_future

routes = Blueprint("plans", __name__)
PLAN_UPDATES_PER_MINUTE = 30


def page(where: str, params: dict) -> dict:
    """Read bounded plans with the other participant's display name."""
    limit = query_int("limit", 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE)
    offset = query_int("offset", 0, MAX_PAGE_OFFSET, 0)
    rows = (
        db()
        .execute(
            """SELECT p.*, u.first_name AS partner_first_name,
               u.last_name AS partner_last_name,
               CASE WHEN p.creator_id = %(me)s THEN p.partner_id
                    ELSE p.creator_id END AS other_id
           FROM date_plans p JOIN users u ON u.id = CASE
               WHEN p.creator_id = %(me)s THEN p.partner_id ELSE p.creator_id END
           WHERE """
            + where
            + """
           ORDER BY CASE WHEN p.state IN ('proposed', 'accepted')
               AND p.starts_at > now() THEN 0 ELSE 1 END,
               p.starts_at, p.id LIMIT %(limit)s OFFSET %(offset)s""",
            {**params, "me": g.user_id, "limit": limit + 1, "offset": offset},
        )
        .fetchall()
    )
    return serialize({"plans": rows[:limit], "has_more": len(rows) > limit})


@routes.get("/chat/<int:user_id>/plans")
@signed_in
def conversation_plans(user_id: int) -> dict:
    """List plans shared by a current mutual connection, including past plans."""
    with db().transaction():
        pair(user_id)
        connection_required(user_id)
        return page(
            "(p.creator_id, p.partner_id) IN "
            "((%(me)s, %(other)s), (%(other)s, %(me)s))",
            {"other": user_id},
        )


@routes.get("/me/plans")
@signed_in
def upcoming_plans() -> dict:
    """List upcoming proposed and confirmed arrangements for the current member."""
    return page(
        """%(me)s IN (p.creator_id, p.partner_id) AND p.starts_at > now()
           AND p.state IN ('proposed', 'accepted')
           AND is_connected(p.creator_id, p.partner_id)""",
        {},
    )


@routes.post("/chat/<int:user_id>/plans")
@signed_in
def create_plan(user_id: int) -> tuple[dict, int]:
    """Propose a date with retry-safe creation and one invitation notification."""
    rate_limit(f"plan:{g.user_id}", PLAN_UPDATES_PER_MINUTE)
    data = object_body(*DETAIL_FIELDS, "client_id", required=("client_id",))
    values = details(data)
    client_id = request_id(data["client_id"])
    with db().transaction():
        me, other = pair(user_id)
        connection_required(other)
        existing = (
            db()
            .execute(
                "SELECT * FROM date_plans WHERE creator_id = %s AND client_id = %s",
                (me, client_id),
            )
            .fetchone()
        )
        if existing:
            # Compare against the original proposal even if it was later rescheduled.
            original = (
                db()
                .execute(
                    "SELECT snapshot FROM date_plan_history "
                    "WHERE plan_id = %s AND version = 1",
                    (existing["id"],),
                )
                .fetchone()["snapshot"]
            )
            same = (
                existing["partner_id"] == other
                and all(
                    original[key] == value
                    for key, value in values.items()
                    if key != "starts_at"
                )
                and datetime.fromisoformat(original["starts_at"]) == values["starts_at"]
            )
            if not same:
                raise ApiError(
                    HTTPStatus.CONFLICT, "client_id belongs to another proposal."
                )
            return serialize(existing), HTTPStatus.OK
        require_future(values["starts_at"])
        row = (
            db()
            .execute(
                """INSERT INTO date_plans
               (creator_id, partner_id, proposed_by, updated_by,
               client_id, title, starts_at, timezone, venue, notes, activity)
               VALUES (%(me)s, %(other)s, %(me)s, %(me)s, %(client)s, %(title)s,
                   %(starts_at)s, %(timezone)s, %(venue)s, %(notes)s, %(activity)s)
                   RETURNING *""",
                {**values, "me": me, "other": other, "client": client_id},
            )
            .fetchone()
        )
        message_id = record_history(row["id"], me, "propose")
        notify(other, me, "plan", message_id)
    return serialize(row), HTTPStatus.CREATED


@routes.patch("/plans/<int:plan_id>")
@signed_in
def update_plan(plan_id: int) -> dict:
    """Respond to, cancel or reschedule the exact version the participant saw."""
    rate_limit(f"plan:{g.user_id}", PLAN_UPDATES_PER_MINUTE)
    data = object_body(
        "action", "version", *DETAIL_FIELDS, required=("action", "version")
    )
    action = data["action"]
    version = data["version"]
    if action not in ("accept", "decline", "cancel", "reschedule"):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Unknown plan action.")
    if type(version) is not int or not 1 <= version < 2147483647:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "version must be a positive integer."
        )
    if action != "reschedule" and any(key in data for key in DETAIL_FIELDS):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Only rescheduling changes details."
        )
    with db().transaction():
        row = (
            db()
            .execute(
                "SELECT * FROM date_plans WHERE id = %s "
                "AND %s IN (creator_id, partner_id)",
                (check_id(plan_id), g.user_id),
            )
            .fetchone()
        )
        if not row:
            raise ApiError(HTTPStatus.NOT_FOUND, "Plan not found.")
        other = (
            row["partner_id"] if row["creator_id"] == g.user_id else row["creator_id"]
        )
        pair(other)
        connection_required(other)
        row = (
            db()
            .execute("SELECT * FROM date_plans WHERE id = %s FOR UPDATE", (plan_id,))
            .fetchone()
        )
        if row["version"] != version:
            raise ApiError(
                HTTPStatus.CONFLICT, "This plan changed. Refresh before responding."
            )
        if row["state"] not in ("proposed", "accepted") or row[
            "starts_at"
        ] <= datetime.now(UTC):
            raise ApiError(
                HTTPStatus.CONFLICT, "This plan is no longer open for changes."
            )
        if action in ("accept", "decline") and (
            row["state"] != "proposed" or row["proposed_by"] == g.user_id
        ):
            raise ApiError(HTTPStatus.FORBIDDEN, "Only the invited member can respond.")
        values = {
            key: row[key]
            for key in ("title", "starts_at", "timezone", "venue", "notes", "activity")
        }
        state = {
            "accept": "accepted",
            "decline": "declined",
            "cancel": "cancelled",
            "reschedule": "proposed",
        }[action]
        proposed_by = row["proposed_by"]
        if action == "reschedule":
            values = details(
                {**data, "activity": data.get("activity", row["activity"])}
            )
            require_future(values["starts_at"])
            proposed_by = g.user_id
        updated = (
            db()
            .execute(
                """UPDATE date_plans SET title = %(title)s, starts_at = %(starts_at)s,
               timezone = %(timezone)s, venue = %(venue)s, notes = %(notes)s,
               activity = %(activity)s,
               state = %(state)s, proposed_by = %(proposed_by)s,
               version = version + 1, updated_by = %(me)s, updated_at = now(),
               cancellation_reason = CASE WHEN %(state)s = 'cancelled'
                   THEN 'Cancelled by a participant' ELSE NULL END
               WHERE id = %(id)s RETURNING *""",
                {
                    **values,
                    "state": state,
                    "proposed_by": proposed_by,
                    "me": g.user_id,
                    "id": plan_id,
                },
            )
            .fetchone()
        )
        message_id = record_history(plan_id, g.user_id, action)
        notify(other, g.user_id, "plan", message_id)
    return serialize(updated)
