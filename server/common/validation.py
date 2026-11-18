import math
from http import HTTPStatus
import re
import unicodedata

from flask import request

from .http import ApiError


def text(
    value: str,
    field: str,
    maximum: int,
    minimum: int = 1,
    strip: bool = True,
    multiline: bool = False,
) -> str:
    """Validate text length and reject disallowed control characters.

    Args:
        value (str): Text to check.
        field (str): Field name for errors.
        maximum (int): Length ceiling.
        minimum (int): Length floor.
        strip (bool): Trim edges.
        multiline (bool): Allow tabs and newlines.

    Returns:
        str: Validated text.
    """
    value = value.strip() if strip else value
    if not minimum <= len(value) <= maximum or any(
        unicodedata.category(char) in {"Cc", "Cs"}
        and not (multiline and char in "\n\r\t")
        for char in value
    ):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            f"{field} has an invalid length or character.",
        )
    return value


def query_int(name: str, low: int, high: int, default: int | None = None) -> int | None:
    """Read a query parameter as an integer within inclusive bounds.

    Args:
        name (str): Query key.
        low (int): Minimum.
        high (int): Maximum.
        default (int | None): Value to use if the key is absent.

    Returns:
        int | None: Parsed value or default.
    """
    value = request.args.get(name)
    if value is None:
        return default
    if not re.fullmatch(r"[0-9]{1,19}", value) or not low <= int(value) <= high:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, f"{name} must be between {low} and {high}."
        )
    return int(value)


def coordinate(value: int | float, name: str, bound: int) -> int | float:
    """Validate a finite coordinate within the given absolute bound.

    Args:
        value (int | float): Coordinate in degrees.
        name (str): Field name for errors.
        bound (int): Maximum absolute value.

    Returns:
        int | float: Validated coordinate.
    """
    if not -bound <= value <= bound or not math.isfinite(value):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, f"{name} is outside its valid range."
        )
    return value


MAX_ID = (1 << 63) - 1


def check_id(value: int) -> int:
    """Validate a positive PostgreSQL bigint resource ID.

    Args:
        value (int): Resource ID.

    Returns:
        int: Validated ID.
    """
    if not 1 <= value <= MAX_ID:
        raise ApiError(HTTPStatus.NOT_FOUND, "Resource not found.")
    return value
