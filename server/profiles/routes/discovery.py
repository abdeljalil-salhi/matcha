from http import HTTPStatus

from flask import Blueprint, g, request
from psycopg import sql

from ...auth.guard import signed_in
from ...common.db import db
from ...common.http import ApiError
from ...common.validation import query_int, text
from ..tags import tags
from ...common.limits import DEFAULT_PAGE_SIZE, MAX_PAGE_OFFSET, MAX_PAGE_SIZE
from ...location.limits import EARTH_RADIUS_KM
from ..limits import MAX_PROFILE_AGE, MAX_PROFILE_TAGS, MIN_PROFILE_AGE
from ..ranking import (
    DISCOVER,
    ORDERS,
    OTHER_CITY_PRIORITY,
    SAME_AREA_PRIORITY,
    SAME_CITY_PRIORITY,
    FAME_WEIGHT,
    MAX_DISTANCE_KM,
    MAX_FAME,
    MAX_LOCATION_FILTER_LENGTH,
    PROXIMITY_DECAY_KM,
    PROXIMITY_WEIGHT,
    SHARED_TAG_CAP,
    SHARED_TAG_WEIGHT,
)

routes = Blueprint("discovery", __name__)


@routes.get("/discovery/suggestions")
@routes.get("/discovery/search")
@signed_in
def discover() -> dict:
    """List profiles by recommendation score or a selected sort and filters.

    Args:
        Query parameters:
            min_age, max_age (int, optional): Inclusive age range.
            min_fame, max_fame (int, optional): Inclusive fame range.
            min_common_tags (int, optional): Shared-tag minimum.
            max_distance_km (int, optional): Distance limit in kilometers.
            location (str, optional): Place label to match.
            tag (str, optional, repeatable): Required tag.
            sort (str, optional): Sort field.
            direction (str, optional): Sort direction.
            limit (int, optional): Maximum number of results.
            offset (int, optional): Number of results to skip.

    Returns:
        dict: Matching profiles with distance and shared-tag counts.
    """
    suggested = request.path.endswith("suggestions")
    viewer = (
        db()
        .execute(
            "SELECT city, EXISTS (SELECT 1 FROM public_profiles WHERE id = %s) AS "
            "complete "
            "FROM users WHERE id = %s",
            (g.user_id, g.user_id),
        )
        .fetchone()
    )
    if not viewer["city"]:
        raise ApiError(HTTPStatus.CONFLICT, "Set your location before using discovery.")
    if suggested and not viewer["complete"]:
        raise ApiError(
            HTTPStatus.CONFLICT, "Complete your profile before using suggestions."
        )
    order = request.args.get("sort", "recommended")
    if order not in ORDERS:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Unknown sort field.")
    direction = request.args.get(
        "direction", "asc" if order in ("age", "location", "recommended") else "desc"
    )
    if direction not in ("asc", "desc") or (
        order == "recommended" and direction != "asc"
    ):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Invalid sort direction.")
    params = {
        "me": g.user_id,
        "earth_radius_km": EARTH_RADIUS_KM,
        "same_area_priority": SAME_AREA_PRIORITY,
        "same_city_priority": SAME_CITY_PRIORITY,
        "other_city_priority": OTHER_CITY_PRIORITY,
        "proximity_weight": PROXIMITY_WEIGHT,
        "proximity_decay_km": PROXIMITY_DECAY_KM,
        "shared_tag_cap": SHARED_TAG_CAP,
        "shared_tag_weight": SHARED_TAG_WEIGHT,
        "fame_weight": FAME_WEIGHT,
        "suggested": suggested,
        "min_age": query_int(
            "min_age", MIN_PROFILE_AGE, MAX_PROFILE_AGE, MIN_PROFILE_AGE
        ),
        "max_age": query_int(
            "max_age", MIN_PROFILE_AGE, MAX_PROFILE_AGE, MAX_PROFILE_AGE
        ),
        "min_fame": query_int("min_fame", 0, MAX_FAME, 0),
        "max_fame": query_int("max_fame", 0, MAX_FAME, MAX_FAME),
        "min_common_tags": query_int("min_common_tags", 0, MAX_PROFILE_TAGS, 0),
        "max_distance_km": query_int(
            "max_distance_km", 0, MAX_DISTANCE_KM, MAX_DISTANCE_KM
        ),
        "location": text(
            request.args.get("location", ""),
            "location",
            MAX_LOCATION_FILTER_LENGTH,
            minimum=0,
        ).lower(),
        "tags": tags(request.args.getlist("tag")),
        "limit": query_int("limit", 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
        "offset": query_int("offset", 0, MAX_PAGE_OFFSET, 0),
    }
    if params["min_age"] > params["max_age"] or params["min_fame"] > params["max_fame"]:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "The minimum cannot exceed the maximum."
        )
    ordering = sql.SQL(" DESC") if direction == "desc" else sql.SQL("")
    return {
        "profiles": db()
        .execute(sql.SQL(DISCOVER).format(ORDERS[order], ordering), params)
        .fetchall()
    }
