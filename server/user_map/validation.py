import math
from http import HTTPStatus

from flask import request

from ..common.http import ApiError
from ..location.limits import MAX_LATITUDE_DEGREES, MAX_LONGITUDE_DEGREES
from .types import MapBounds


def bound(name: str, maximum: int) -> float:
    """Parse one required finite viewport coordinate from the query string.

    Args:
        name (str): Query parameter name.
        maximum (int): Absolute coordinate limit.

    Returns:
        float: Validated coordinate in degrees.
    """
    values = request.args.getlist(name)
    try:
        value = float(values[0]) if len(values) == 1 else float("nan")
    except ValueError:
        value = float("nan")
    if not math.isfinite(value) or not -maximum <= value <= maximum:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, f"Invalid map bound: {name}.")
    return value


def viewport() -> MapBounds:
    """Validate a nonempty viewport, allowing antimeridian-crossing bounds.

    Args:
        None.

    Returns:
        MapBounds: Inclusive latitude and longitude bounds.
    """
    bounds: MapBounds = {
        "west": bound("west", MAX_LONGITUDE_DEGREES),
        "east": bound("east", MAX_LONGITUDE_DEGREES),
        "south": bound("south", MAX_LATITUDE_DEGREES),
        "north": bound("north", MAX_LATITUDE_DEGREES),
    }
    if bounds["south"] >= bounds["north"] or bounds["west"] == bounds["east"]:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Map bounds must enclose an area."
        )
    return bounds
