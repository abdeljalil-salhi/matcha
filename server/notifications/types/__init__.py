from typing import Literal, TypedDict

from ...common.types import JsonObject

type NotificationKind = Literal["like", "visit", "message", "match", "unlike"]


class UnreadCounts(TypedDict):
    """Unread totals for all notifications and for messages."""

    total: int
    messages: int


class NotificationPage(TypedDict):
    """Visible notifications and unread counts."""

    unread: UnreadCounts
    notifications: list[JsonObject]
