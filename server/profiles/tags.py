import re
from http import HTTPStatus
import unicodedata

from ..common.http import ApiError
from ..common.validation import text
from .limits import MAX_PROFILE_TAGS, MAX_TAG_LENGTH


def tags(values: list[str]) -> list[str]:
    """Normalize, deduplicate, and sort up to 15 interest tags.

    Args:
        values (list[str]): Raw interest tags.

    Returns:
        list[str]: Normalized tags.
    """
    if len(values) > MAX_PROFILE_TAGS:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Provide an array of up to 15 tags."
        )
    result = set()
    for value in values:
        tag = (
            unicodedata.normalize("NFKC", text(value, "tag", MAX_TAG_LENGTH + 1))
            .lower()
            .removeprefix("#")
        )
        if not re.fullmatch(rf"[^\W_][\w-]{{0,{MAX_TAG_LENGTH - 1}}}", tag):
            raise ApiError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Tags must begin with a letter or digit and contain no spaces.",
            )
        result.add(tag)
    return sorted(result)
