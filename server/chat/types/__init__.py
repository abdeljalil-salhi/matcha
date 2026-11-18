from typing import TypedDict

from ...common.types import JsonObject


class MessagePage(TypedDict):
    """Messages returned in chronological order."""

    messages: list[JsonObject]
