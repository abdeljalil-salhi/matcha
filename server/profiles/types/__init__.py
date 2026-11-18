from typing import TypedDict


class PhotoSummary(TypedDict):
    """Photo identifier and primary status exposed by the API."""

    id: int
    is_primary: bool
