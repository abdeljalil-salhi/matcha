from collections.abc import Iterable
from http import HTTPStatus

from flask import request

from .http import ApiError
from .types import JsonObject, JsonValue
from ..profiles.limits import MAX_PROFILE_TAGS


def object_body(*allowed: str, required: Iterable[str] = ()) -> JsonObject:
    """Read a JSON object and validate its field names.

    Args:
        *allowed (str): Accepted keys.
        required (Iterable[str]): Required keys.

    Returns:
        JsonObject: Validated request body.
    """
    fields = request.get_json()
    if not isinstance(fields, dict):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Expected a JSON object.")
    if set(fields).difference(allowed):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "The body contains unsupported fields."
        )
    if set(required).difference(fields):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "The body is missing required fields."
        )
    return fields


def require_string(value: JsonValue, field: str) -> str:
    """Check that a JSON field contains a string.

    Args:
        value (JsonValue): Incoming field value.
        field (str): Field name for the error response.

    Returns:
        str: Checked field value.
    """
    if not isinstance(value, str):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, f"{field} must be text.")
    return value


def require_tags(value: JsonValue) -> list[str]:
    """Check the JSON array and item types for interest tags.

    Args:
        value (JsonValue): Incoming tags field.

    Returns:
        list[str]: Up to 15 string tags.
    """
    if not isinstance(value, list) or len(value) > MAX_PROFILE_TAGS:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Provide an array of up to 15 tags."
        )
    return [require_string(item, "tag") for item in value]


def require_coordinate(value: JsonValue, field: str) -> int | float:
    """Read a JSON number as a coordinate in degrees.

    Args:
        value (JsonValue): Incoming coordinate.
        field (str): Field name for the error response.

    Returns:
        int | float: Checked coordinate.
    """
    if type(value) is int or type(value) is float:
        return value
    raise ApiError(
        HTTPStatus.UNPROCESSABLE_ENTITY, f"{field} is outside its valid range."
    )
