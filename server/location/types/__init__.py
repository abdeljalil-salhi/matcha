from typing import Literal, TypedDict

type Coordinate = int | float
type Place = tuple[str, str | None, str, float, float]
type LocationSource = Literal["manual", "gps"]


class SavedLocation(TypedDict):
    """Public result of saving a location."""

    city: str
    area: str | None
    country_code: str
    location_source: LocationSource
