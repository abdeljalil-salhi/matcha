from datetime import UTC, date, datetime, time
from http import HTTPStatus
from typing import Any, cast

from flask import current_app
from werkzeug.exceptions import HTTPException

from .limits import RATE_LIMIT_WINDOW_SECONDS


class ApiError(HTTPException):
    def __init__(self, status: HTTPStatus, message: str) -> None:
        """Initialize an HTTP error with a client-facing message.

        Args:
            status (HTTPStatus): HTTP status.
            message (str): Public error description.

        Returns:
            None.
        """
        super().__init__(description=message)
        self.code = status


def rate_limit(
    key: str, maximum: int, seconds: int = RATE_LIMIT_WINDOW_SECONDS
) -> None:
    """Count requests in a time window and raise HTTP 429 past the limit.

    Args:
        key (str): Bucket.
        maximum (int): Limit.
        seconds (int): Window length.

    Returns:
        None.
    """
    if not current_app.config["RATELIMIT"]:
        return
    with current_app.extensions["db"].connection() as connection:
        result = connection.execute(
            """INSERT INTO rate_windows (bucket, window_start, hits)
               VALUES (%s, to_timestamp(floor(extract(epoch FROM clock_timestamp()) /
                   %s) * %s), 1)
               ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_windows.hits
                   + 1
               RETURNING hits""",
            (key, seconds, seconds),
        ).fetchone()
    if result["hits"] > maximum:
        raise ApiError(
            HTTPStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later."
        )


def instant(value: date | datetime | time) -> str:
    """Format a temporal value as ISO 8601, using UTC for datetimes.

    Args:
        value (date | datetime | time): Value to format.

    Returns:
        str: ISO-formatted value.
    """
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return value.isoformat()


def serialize(value: object) -> Any:
    """Convert temporal values in dictionaries and lists for JSON output.

    Args:
        value (object): Value or nested collection to serialize.

    Returns:
        Any: Converted value, with other scalar values passed through.
    """
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [serialize(item) for item in value]
    if hasattr(value, "isoformat"):
        return instant(cast(date | datetime | time, value))
    return value
