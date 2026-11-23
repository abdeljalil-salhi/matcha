from http import HTTPStatus

from flask import Blueprint, g

from ..auth.guard import signed_in
from ..common.db import db, lock_users
from ..common.http import ApiError, rate_limit
from ..common.request_data import object_body
from ..common.validation import MAX_ID, query_int
from .limits import (
    MAP_PAGE_SIZE,
    MAP_QUERIES_PER_MINUTE,
    MAP_SHARING_UPDATES_PER_MINUTE,
)
from .queries import profiles, settings
from .types import MapPage, MapSettings
from .validation import viewport

routes = Blueprint("user_map", __name__)


def require_complete_profile() -> None:
    """Require the same completed profile policy used by matching suggestions.

    Args:
        None.

    Returns:
        None.
    """
    if (
        not db()
        .execute("SELECT 1 FROM public_profiles WHERE id = %s", (g.user_id,))
        .fetchone()
    ):
        raise ApiError(
            HTTPStatus.CONFLICT, "Complete your profile before using the user map."
        )


@routes.get("/map/profiles")
@signed_in
def map_profiles() -> MapPage:
    """Return one bounded page of compatible users in the requested viewport.

    Args:
        Query parameters:
            west, east, south, north (float): Required viewport bounds.
            after (int, optional): Exclusive profile cursor, default zero.
            limit (int, optional): Page size from one to one hundred.

    Returns:
        MapPage: Approximate public points, pagination flag and next cursor.
    """
    rate_limit(f"map:{g.user_id}", MAP_QUERIES_PER_MINUTE)
    bounds = viewport()
    after = query_int("after", 0, MAX_ID, 0)
    limit = query_int("limit", 1, MAP_PAGE_SIZE, MAP_PAGE_SIZE)
    require_complete_profile()
    rows = profiles(bounds, after, limit + 1)
    more = len(rows) > limit
    page = rows[:limit]
    return {
        "profiles": page,
        "has_more": more,
        "next_after": page[-1]["id"] if more else None,
    }


@routes.get("/me/map")
@signed_in
def map_settings() -> MapSettings:
    """Read private map sharing settings without enabling location sharing.

    Args:
        None.

    Returns:
        MapSettings: Current opt-in state and approximate saved map center.
    """
    return settings()


@routes.put("/me/map")
@signed_in
def update_map_settings() -> MapSettings:
    """Change the caller's map visibility using separate explicit sharing consent.

    Args:
        Request body (JSON):
            map_visible (bool): Desired sharing state.
            consent (bool, optional): Must be true when enabling map sharing.

    Returns:
        MapSettings: Saved opt-in state and caller-owned approximate center.
    """
    rate_limit(f"map-settings:{g.user_id}", MAP_SHARING_UPDATES_PER_MINUTE)
    data = object_body("map_visible", "consent", required=("map_visible",))
    visible = data["map_visible"]
    if type(visible) is not bool or (
        "consent" in data and type(data["consent"]) is not bool
    ):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Map sharing choices must be booleans."
        )
    if visible and data.get("consent") is not True:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Explicit map sharing consent is required."
        )
    with db().transaction():
        lock_users(g.user_id)
        if visible:
            require_complete_profile()
        db().execute(
            """UPDATE users SET map_visible = %s,
               map_shared_at = CASE WHEN %s THEN now() ELSE NULL END WHERE id = %s""",
            (visible, visible, g.user_id),
        )
    return settings()
