from flask import Blueprint, request

from ...auth.guard import signed_in
from ...common.db import db
from ...common.validation import text
from ..limits import MAX_TAG_LENGTH, TAG_SUGGESTION_LIMIT

routes = Blueprint("tags", __name__)


@routes.get("/tags")
@signed_in
def list_tags() -> dict[str, list[str]]:
    """Search reusable interest tags by prefix.

    Args:
        Query parameters:
            q (str, optional): Prefix to match.

    Returns:
        dict[str, list[str]]: Matching tags.
    """
    query = (
        text(request.args.get("q", ""), "q", MAX_TAG_LENGTH, minimum=0)
        .lower()
        .removeprefix("#")
    )
    return {
        "tags": [
            row["name"]
            for row in db().execute(
                "SELECT name FROM tags WHERE starts_with(name, %s) ORDER BY name "
                "LIMIT %s",
                (query, TAG_SUGGESTION_LIMIT),
            )
        ]
    }
