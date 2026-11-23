from flask import g

from ..common.db import db
from .limits import MAP_COORDINATE_DECIMALS
from .types import MapBounds, MapProfile, MapSettings


def settings() -> MapSettings:
    """Read sharing state and saved approximate coordinates for the caller only.

    Args:
        None.

    Returns:
        MapSettings: Caller-owned settings, with no precise GPS history.
    """
    row = (
        db()
        .execute(
            "SELECT map_visible, latitude, longitude FROM users WHERE id = %s",
            (g.user_id,),
        )
        .fetchone()
    )
    return {
        "map_visible": row["map_visible"],
        "center": (
            {
                "latitude": round(row["latitude"], MAP_COORDINATE_DECIMALS),
                "longitude": round(row["longitude"], MAP_COORDINATE_DECIMALS),
            }
            if row["latitude"] is not None and row["longitude"] is not None
            else None
        ),
    }


def profiles(bounds: MapBounds, after: int, limit: int) -> list[MapProfile]:
    """Read opted-in compatible users using only their public approximate points.

    Args:
        bounds (MapBounds): Viewport, possibly crossing the antimeridian.
        after (int): Exclusive profile ID cursor.
        limit (int): Maximum number of records to fetch.

    Returns:
        list[MapProfile]: Visible public summaries, excluding self and blocked pairs.
    """
    return (
        db()
        .execute(
            """WITH viewer AS (SELECT gender, seeks FROM users WHERE id = %(me)s),
        candidates AS (
            SELECT p.id, p.username, p.first_name, p.last_name, p.age, p.city, p.area,
                   p.country_code, p.photo_id, p.fame, p.is_demo,
                   round(u.latitude::numeric, %(precision)s)::double precision
                       AS latitude,
                   round(u.longitude::numeric, %(precision)s)::double precision
                       AS longitude
            FROM public_profiles p JOIN users u ON u.id = p.id CROSS JOIN viewer v
            WHERE u.map_visible AND p.id <> %(me)s AND p.id > %(after)s
              AND NOT is_blocked(%(me)s, p.id)
              AND (v.seeks IS NULL OR p.gender = ANY(v.seeks))
              AND (p.seeks IS NULL OR v.gender = ANY(p.seeks))
        )
        SELECT * FROM candidates
        WHERE latitude BETWEEN %(south)s AND %(north)s
          AND ((%(west)s < %(east)s AND longitude BETWEEN %(west)s AND %(east)s)
               OR (%(west)s > %(east)s AND
                   (longitude >= %(west)s OR longitude <= %(east)s)))
        ORDER BY id LIMIT %(limit)s""",
            {
                **bounds,
                "me": g.user_id,
                "after": after,
                "limit": limit,
                "precision": MAP_COORDINATE_DECIMALS,
            },
        )
        .fetchall()
    )
