from ..common.db import db
from .types import NotificationKind


def notify(
    recipient: int, actor: int, kind: NotificationKind, message_id: int | None = None
) -> None:
    """Queue a notification when the recipient has no applicable block or mute.

    Args:
        recipient (int): Receiver ID.
        actor (int): Originating user ID.
        kind (NotificationKind): Event type.
        message_id (int | None): Associated message.

    Returns:
        None.
    """
    db().execute(
        """INSERT INTO notifications (recipient_id, actor_id, kind, message_id)
           SELECT %(to)s, %(from)s, %(kind)s, %(message)s
           WHERE NOT is_blocked(%(to)s, %(from)s) AND NOT EXISTS
               (SELECT 1 FROM mutes WHERE actor_id = %(to)s AND target_id =
                   %(from)s)""",
        {"to": recipient, "from": actor, "kind": kind, "message": message_id},
    )
