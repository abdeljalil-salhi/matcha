from typing import TypedDict


class MapBounds(TypedDict):
    """Inclusive viewport limits; west greater than east crosses the dateline."""

    west: float
    east: float
    south: float
    north: float


class MapCenter(TypedDict):
    """The account's privately returned approximate saved location."""

    latitude: float
    longitude: float


class MapSettings(TypedDict):
    """Map sharing state and the caller's saved map center."""

    map_visible: bool
    center: MapCenter | None


class MapProfile(TypedDict):
    """Public profile summary at an opted-in approximate location."""

    id: int
    username: str
    first_name: str
    last_name: str
    age: int
    city: str
    area: str | None
    country_code: str
    photo_id: int
    latitude: float
    longitude: float
    fame: int
    is_demo: bool
    tags: list[str]


class MapPage(TypedDict):
    """Bounded viewport page and its exclusive ID cursor."""

    profiles: list[MapProfile]
    has_more: bool
    next_after: int | None
