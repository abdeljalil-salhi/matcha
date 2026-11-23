from typing import TypedDict

from ...common.types import JsonObject


class CallPage(TypedDict):
    """Call state and an ordered page of the other participant's signals."""

    call: JsonObject
    signals: list[JsonObject]
    has_more: bool
