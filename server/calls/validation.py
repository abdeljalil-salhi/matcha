import json
from http import HTTPStatus
from uuid import UUID

from ..common.http import ApiError
from .limits import MAX_CANDIDATE_BYTES, MAX_SDP_BYTES


def identifier(value: object) -> UUID:
    """Parse a browser or retry UUID without accepting arbitrary JSON types.

    Args:
        value (object): Incoming identifier.

    Returns:
        UUID: Valid identifier.
    """
    try:
        if not isinstance(value, str):
            raise ValueError
        return UUID(value)
    except (ValueError, AttributeError):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Expected a UUID.") from None


def signal_payload(kind: object, payload: object) -> dict:
    """Bound signaling data and reject unsupported browser-object fields.

    Args:
        kind (object): Offer, answer or ICE candidate.
        payload (object): JSON description or candidate.

    Returns:
        dict: Validated signaling object.
    """
    if kind not in ("offer", "answer", "ice") or not isinstance(payload, dict):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Invalid call signal.")
    if kind in ("offer", "answer"):
        valid = set(payload) == {"sdp"} and isinstance(payload["sdp"], str)
        valid = valid and payload["sdp"].startswith("v=0")
        limit = MAX_SDP_BYTES
    else:
        valid = not set(payload).difference(
            {"candidate", "sdpMid", "sdpMLineIndex", "usernameFragment"}
        ) and isinstance(payload.get("candidate"), str)
        valid = valid and all(
            payload.get(field) is None
            or (isinstance(payload[field], str) and len(payload[field]) <= 256)
            for field in ("sdpMid", "usernameFragment")
        )
        index = payload.get("sdpMLineIndex")
        valid = valid and (index is None or (type(index) is int and 0 <= index <= 255))
        limit = MAX_CANDIDATE_BYTES
    if not valid or len(json.dumps(payload).encode()) > limit:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Invalid or oversized signal.")
    return payload
