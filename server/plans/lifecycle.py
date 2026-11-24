from uuid import uuid4

from ..common.db import db


def record_history(plan_id: int, actor: int, action: str) -> int:
    """Save a revision and its matching chat message in the caller transaction."""
    db().execute(
        """INSERT INTO date_plan_history (plan_id, version, actor_id, action, snapshot)
           SELECT id, version, %s, %s, to_jsonb(p) FROM date_plans p WHERE id = %s""",
        (actor, action, plan_id),
    )

    heading = {
        "propose": "Date invitation",
        "reschedule": "New date proposal",
        "accept": "Date confirmed",
        "decline": "Date declined",
        "cancel": "Date cancelled",
        "connection_ended": "Date cancelled",
    }[action]
    message = (
        db()
        .execute(
            """INSERT INTO messages (sender_id, recipient_id, client_id, body,
               plan_id, plan_version, plan_action, plan_snapshot)
           SELECT %(actor)s, CASE WHEN p.creator_id = %(actor)s
               THEN p.partner_id ELSE p.creator_id END, %(client)s,
               %(heading)s || ': ' || p.title,
               p.id, p.version, %(action)s, h.snapshot
           FROM date_plans p JOIN date_plan_history h
               ON h.plan_id = p.id AND h.version = p.version
           WHERE p.id = %(id)s RETURNING id""",
            {
                "actor": actor,
                "client": uuid4(),
                "heading": heading,
                "action": action,
                "id": plan_id,
            },
        )
        .fetchone()
    )
    return message["id"]


def cancel_connection_plans(me: int, other: int) -> None:
    """Cancel active arrangements while the relationship's pair lock is held."""
    plans = (
        db()
        .execute(
            """UPDATE date_plans SET state = 'cancelled', version = version + 1,
           updated_by = %(me)s, updated_at = now(), cancellation_reason =
               'Connection ended'
           WHERE (creator_id, partner_id) IN ((%(me)s, %(other)s), (%(other)s, %(me)s))
             AND state IN ('proposed', 'accepted') AND starts_at > now()
           RETURNING id""",
            {"me": me, "other": other},
        )
        .fetchall()
    )
    for plan in plans:
        record_history(plan["id"], me, "connection_ended")
