from http import HTTPStatus

from flask import Blueprint, g
from psycopg import sql

from ...auth.guard import signed_in
from ...common.db import db, lock_users
from ...common.http import ApiError, serialize
from ...common.request_data import object_body, require_string, require_tags
from ...common.validation import text
from ..tags import tags
from ..validation import GENDERS, birth_date
from ..visibility import photo_list, public_profile
from ..limits import MAX_BIO_LENGTH, MAX_NAME_LENGTH

routes = Blueprint("profiles", __name__)


@routes.get("/me")
@signed_in
def me() -> dict:
    """Read the signed-in user's profile, including private and setup fields.

    Returns:
        dict: Account and profile data, tags, photos, and completeness.
    """
    user = (
        db()
        .execute(
            """SELECT id, username, email, first_name, last_name, birth_date, gender,
                seeks, bio,
                  city, area, country_code, location_source, location_set_at, is_demo,
                  EXISTS (SELECT 1 FROM public_profiles WHERE id = u.id) AS complete,
                  coalesce((SELECT array_agg(tag ORDER BY tag) FROM user_tags WHERE
                      user_id = u.id),
                           ARRAY[]::text[]) AS tags
           FROM users u WHERE id = %s""",
            (g.user_id,),
        )
        .fetchone()
    )
    user["photos"] = photo_list(g.user_id)
    return serialize(user)


@routes.patch("/me")
@signed_in
def edit_profile() -> tuple[str, int]:
    """Validate and apply an update to the signed-in user's profile.

    Args:
        Request body (JSON):
            first_name (str, optional): Given name.
            last_name (str, optional): Family name.
            birth_date (str, optional): Date in YYYY-MM-DD format.
            gender (str, optional): Profile gender.
            bio (str, optional): Biography.
            seeks (list[str] | None, optional): Preferred genders.
            tags (list[str], optional): Interest tags.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    data = object_body(
        "first_name", "last_name", "birth_date", "gender", "seeks", "bio", "tags"
    )
    updates = {}
    for field in ("first_name", "last_name", "bio"):
        if field in data:
            maximum = MAX_BIO_LENGTH if field == "bio" else MAX_NAME_LENGTH
            updates[field] = text(
                require_string(data[field], field),
                field,
                maximum,
                multiline=field == "bio",
            )
    if "birth_date" in data:
        updates["birth_date"] = birth_date(
            require_string(data["birth_date"], "birth_date")
        )
    if "gender" in data:
        if data["gender"] not in GENDERS:
            raise ApiError(
                HTTPStatus.UNPROCESSABLE_ENTITY, "Select a supported gender."
            )
        updates["gender"] = data["gender"]
    if "seeks" in data:
        seeks = data["seeks"]
        if seeks is not None and (
            not isinstance(seeks, list)
            or not 1 <= len(seeks) <= len(GENDERS)
            or any(value not in GENDERS for value in seeks)
        ):
            raise ApiError(
                HTTPStatus.UNPROCESSABLE_ENTITY, "Select one or more preferred genders."
            )
        updates["seeks"] = None if seeks is None else sorted(set(seeks))
    new_tags = tags(require_tags(data["tags"])) if "tags" in data else None
    with db().transaction():
        lock_users(g.user_id)
        if updates:
            assignments = sql.SQL(", ").join(
                sql.SQL("{} = %s").format(sql.Identifier(name)) for name in updates
            )
            db().execute(
                sql.SQL("UPDATE users SET {} WHERE id = %s").format(assignments),
                (*updates.values(), g.user_id),
            )
        if new_tags is not None:
            db().execute("DELETE FROM user_tags WHERE user_id = %s", (g.user_id,))
            db().execute(
                "INSERT INTO tags SELECT unnest(%s::text[]) ON CONFLICT DO NOTHING",
                (new_tags,),
            )
            db().execute(
                "INSERT INTO user_tags SELECT %s, unnest(%s::text[])",
                (g.user_id, new_tags),
            )
    return "", HTTPStatus.NO_CONTENT


@routes.get("/profiles/<int:user_id>")
@signed_in
def view_profile(user_id: int) -> dict:
    """Read a visible profile with photos and viewer-specific like status.

    Args:
        Path parameters:
            user_id (int): Profile owner's ID.

    Returns:
        dict: Public profile and current relationship flags.
    """
    profile = public_profile(user_id)
    profile["photos"] = photo_list(user_id)
    profile.update(
        db()
        .execute(
            """SELECT EXISTS (SELECT 1 FROM likes WHERE actor_id = %(me)s AND target_id
                = %(other)s) AS likes_them,
                  EXISTS (SELECT 1 FROM likes WHERE actor_id = %(other)s AND target_id =
                      %(me)s) AS likes_you,
                  is_connected(%(me)s, %(other)s) AS connected""",
            {"me": g.user_id, "other": user_id},
        )
        .fetchone()
    )
    return serialize(profile)
