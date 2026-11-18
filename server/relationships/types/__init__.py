from typing import TypedDict


class LikeResult(TypedDict):
    """Current connection status after liking a profile."""

    connected: bool


class BlockedUser(TypedDict):
    """Account identity exposed in the block list."""

    id: int
    username: str


class BlockList(TypedDict):
    """Page of accounts blocked by the caller."""

    blocks: list[BlockedUser]
