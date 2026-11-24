from datetime import UTC, datetime
from http import HTTPStatus
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..common.http import ApiError
from ..common.request_data import require_string
from ..common.validation import text

DETAIL_FIELDS = ("title", "local_time", "timezone", "venue", "notes")


def request_id(value: object) -> UUID:
    """Validate a stable client identifier for a retried proposal."""
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "client_id must be a UUID.")


def details(data: dict) -> dict:
    """Resolve an unambiguous local meeting time in its selected IANA timezone."""
    title = text(require_string(data.get("title"), "title"), "title", 100)
    venue = text(require_string(data.get("venue"), "venue"), "venue", 200)
    notes = text(
        require_string(data.get("notes", ""), "notes"),
        "notes",
        1000,
        minimum=0,
        multiline=True,
    )
    timezone = text(require_string(data.get("timezone"), "timezone"), "timezone", 80)
    try:
        zone = ZoneInfo(timezone)
        local = datetime.fromisoformat(
            require_string(data.get("local_time"), "local_time")
        )
    except (ValueError, ZoneInfoNotFoundError):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Choose a valid date and timezone."
        )
    if local.tzinfo is not None:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "local_time must have no offset."
        )
    try:
        candidates = {
            local.replace(tzinfo=zone, fold=fold).astimezone(UTC)
            for fold in (0, 1)
            if local.replace(tzinfo=zone, fold=fold)
            .astimezone(UTC)
            .astimezone(zone)
            .replace(tzinfo=None)
            == local
        }
    except (OverflowError, ValueError):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Choose a valid meeting time.")
    if len(candidates) != 1:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "This time is skipped or repeated by a clock change. Choose another time.",
        )
    return {
        "title": title,
        "starts_at": candidates.pop(),
        "timezone": timezone,
        "venue": venue,
        "notes": notes,
    }


def require_future(starts_at: datetime) -> None:
    """Reject proposals whose scheduled time has already passed."""
    if starts_at <= datetime.now(UTC):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Choose a future meeting time.")
