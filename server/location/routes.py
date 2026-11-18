from http import HTTPStatus

from flask import Blueprint, g

from ..auth.guard import signed_in
from ..common.db import db
from ..common.http import ApiError, rate_limit
from .geocoding import gps_location, manual_location
from .types import SavedLocation
from ..common.request_data import object_body, require_coordinate, require_string
from .limits import LOCATION_DECIMAL_PLACES

LOCATION_UPDATES_PER_MINUTE = 12

routes = Blueprint("location", __name__)


@routes.put("/me/location")
@signed_in
def save_location() -> SavedLocation:
    """Resolve and save an approximate location for the signed-in user.

    Args:
        Request body (JSON):
            source (str): Either 'manual' or 'gps'.
            query (str): Place lookup for manual entry.
            latitude (int | float): Latitude for GPS entry.
            longitude (int | float): Longitude for GPS entry.
            consent (bool): Explicit permission required for GPS entry.

    Returns:
        SavedLocation: Resolved city, area, country code, and source.
    """
    data = object_body(
        "source", "query", "latitude", "longitude", "consent", required=("source",)
    )
    rate_limit(f"location:{g.user_id}", LOCATION_UPDATES_PER_MINUTE)
    source = data["source"]
    if source == "manual" and set(data) == {"source", "query"}:
        place = manual_location(require_string(data["query"], "query"))
    elif source == "gps" and set(data) == {
        "source",
        "latitude",
        "longitude",
        "consent",
    }:
        if data["consent"] is not True:
            raise ApiError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Explicit consent is required to use GPS.",
            )
        latitude = require_coordinate(data["latitude"], "latitude")
        longitude = require_coordinate(data["longitude"], "longitude")
        place = gps_location(latitude, longitude)
    else:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Provide either a manual query or GPS coordinates with explicit consent.",
        )
    city, area, country_code, lat, lon = place
    db().execute(
        """UPDATE users SET city = %s, area = %s, country_code = %s, latitude = %s,
            longitude = %s,
                  location_source = %s, location_set_at = now() WHERE id = %s""",
        (
            city,
            area,
            country_code,
            round(lat, LOCATION_DECIMAL_PLACES),
            round(lon, LOCATION_DECIMAL_PLACES),
            source,
            g.user_id,
        ),
    )
    return {
        "city": city,
        "area": area,
        "country_code": country_code,
        "location_source": source,
    }


@routes.delete("/me/location")
@signed_in
def remove_location() -> tuple[str, int]:
    """Clear the signed-in user's saved location.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    db().execute(
        """UPDATE users SET city = NULL, area = NULL, country_code = NULL, latitude =
            NULL,
                  longitude = NULL, location_source = NULL, location_set_at = NULL WHERE
                      id = %s""",
        (g.user_id,),
    )
    return "", HTTPStatus.NO_CONTENT
