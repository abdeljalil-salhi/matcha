import math
from http import HTTPStatus

from ..common.http import ApiError
from ..common.validation import coordinate, text
from .confirmation import CityConfirmationRequired
from .places import PLACES
from .provider import provider
from .results import from_result
from .limits import (
    EARTH_RADIUS_KM,
    MAX_LATITUDE_DEGREES,
    MAX_LONGITUDE_DEGREES,
)
from .types import Coordinate, Place

OFFLINE_NEIGHBORHOOD_RADIUS_KM = 1
MAX_PLACE_QUERY_LENGTH = 160
GEOCODER_SEARCH_LIMIT = 5
GEOCODER_NEIGHBORHOOD_ZOOM = 14


def lookup(query: str) -> Place | None:
    """Match a place against the offline fixtures, preferring a city center.

    Args:
        query (str): Comma-separated place labels.

    Returns:
        Place | None: City, area, country code, latitude, and longitude.
    """
    names = [part.strip().casefold() for part in query.split(",")]
    matches = [
        place
        for place in PLACES
        if names[0] in [part.casefold() for part in place[:2] if part]
        and all(
            part in [field.casefold() for field in place[:3] if field]
            for part in names[1:]
        )
    ]
    return min(matches, key=lambda place: place[1] is not None, default=None)


def haversine(lat: float, lon: float, place: Place) -> float:
    """Calculate great-circle distance to an offline place.

    Args:
        lat (float): Latitude.
        lon (float): Longitude.
        place (Place): Fixture.

    Returns:
        float: Distance in kilometers.
    """
    other_lat, other_lon = place[3:]
    angle = math.sin(math.radians(other_lat - lat) / 2) ** 2 + (
        math.cos(math.radians(lat))
        * math.cos(math.radians(other_lat))
        * math.sin(math.radians(other_lon - lon) / 2) ** 2
    )
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(min(angle, 1)))


def local_reverse(lat: float, lon: float) -> Place | None:
    """Find a nearby offline neighborhood within the configured radius.

    Args:
        lat (float): Latitude.
        lon (float): Longitude.

    Returns:
        Place | None: City, area, country code, latitude, and longitude.
    """
    nearest = min(
        (place for place in PLACES if place[1]),
        key=lambda place: haversine(lat, lon, place),
        default=None,
    )
    return (
        nearest
        if nearest and haversine(lat, lon, nearest) <= OFFLINE_NEIGHBORHOOD_RADIUS_KM
        else None
    )


def manual_location(query: str) -> Place:
    """Resolve a place name through offline fixtures or the geocoder.

    Args:
        query (str): Raw city or neighborhood search input.

    Returns:
        Place: City, area, country code, latitude, and longitude.
    """
    query = text(query, "query", MAX_PLACE_QUERY_LENGTH)
    fixture = lookup(query)
    if fixture:
        return fixture
    matches = provider(
        "search",
        {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": GEOCODER_SEARCH_LIMIT,
        },
    )
    if isinstance(matches, list):
        for result in matches:
            place = from_result(result)
            if place:
                return place
    raise ApiError(
        HTTPStatus.UNPROCESSABLE_ENTITY,
        "Location not found. Enter a city or neighborhood and country.",
    )


def gps_location(latitude: Coordinate, longitude: Coordinate) -> Place:
    """Resolve a neighborhood from consented coordinates before storage rounding.

    Args:
        latitude (Coordinate): Latitude in degrees.
        longitude (Coordinate): Longitude in degrees.

    Returns:
        Place: City, neighborhood, country code, latitude, and longitude.
    """
    lat = coordinate(latitude, "latitude", MAX_LATITUDE_DEGREES)
    lon = coordinate(longitude, "longitude", MAX_LONGITUDE_DEGREES)
    # The offline fixtures are authoritative where they exist. This keeps the
    # seeded neighborhoods stable even when an online geocoder is configured.
    offline = local_reverse(lat, lon)
    if offline:
        return offline
    result = provider(
        "reverse",
        {
            "lat": lat,
            "lon": lon,
            "format": "jsonv2",
            "zoom": GEOCODER_NEIGHBORHOOD_ZOOM,
            "addressdetails": 1,
        },
    )
    place = from_result(result) if result is not None else None
    if not place:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "No neighborhood found. Enter your city or neighborhood manually.",
        )
    if not place[1] or not place[1].strip():
        raise CityConfirmationRequired(place)
    return place
