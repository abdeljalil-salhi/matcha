import hashlib
import hmac
from http import HTTPStatus
from uuid import UUID, uuid4

from flask import current_app, request

from ..common.db import db, lock_users
from ..common.http import ApiError, rate_limit
from ..common.validation import text
from .types import LinkKind
from .limits import AUTH_RATE_WINDOW_SECONDS, DEFAULT_AUTH_IP_LIMIT

LINK_TOKEN_LENGTH = 101  # UUID, separator, and hex SHA-256 signature.


def link_token(link_id: UUID, kind: LinkKind, secret: str) -> str:
    """Sign a one-use account link for a specific purpose.

    Args:
        link_id (UUID): Link identifier.
        kind (LinkKind): Link purpose.
        secret (str): Signing key.

    Returns:
        str: Signed link token.
    """
    signature = hmac.new(
        secret.encode(), f"{kind}:{link_id}".encode(), hashlib.sha256
    ).hexdigest()
    return f"{link_id}.{signature}"


def queue_link(user_id: int, kind: LinkKind, destination: str, minutes: int) -> None:
    """Replace a previous link and enqueue an email in the current transaction.

    Args:
        user_id (int): Account ID.
        kind (LinkKind): Link purpose.
        destination (str): Email address.
        minutes (int): Link lifetime.

    Returns:
        None.
    """
    db().execute(
        "DELETE FROM account_links WHERE user_id = %s AND kind = %s", (user_id, kind)
    )
    link_id = uuid4()
    db().execute(
        """INSERT INTO account_links VALUES (%s, %s, %s, %s, now() + %s * interval
            '1 minute')""",
        (link_id, user_id, kind, destination, minutes),
    )
    db().execute("INSERT INTO mail_outbox (link_id) VALUES (%s)", (link_id,))


def consume_link(token: str, kind: LinkKind) -> tuple[dict, str]:
    """Validate and consume an unexpired link in the current transaction.

    Args:
        token (str): Signed link token.
        kind (LinkKind): Expected purpose.

    Returns:
        tuple[dict, str]: Locked user row and destination email.
    """
    generic = "This link is invalid or has expired."
    token = text(token, "token", LINK_TOKEN_LENGTH, LINK_TOKEN_LENGTH)
    try:
        link_id = UUID(token.split(".")[0])
    except ValueError:
        raise ApiError(HTTPStatus.BAD_REQUEST, generic) from None
    if not hmac.compare_digest(
        token.encode(),
        link_token(link_id, kind, current_app.config["MATCHA_SECRET"]).encode(),
    ):
        raise ApiError(HTTPStatus.BAD_REQUEST, generic)
    link = (
        db()
        .execute("SELECT user_id FROM account_links WHERE id = %s", (link_id,))
        .fetchone()
    )
    if link is None:
        raise ApiError(HTTPStatus.BAD_REQUEST, generic)
    user = lock_users(link["user_id"])[0]
    link = (
        db()
        .execute(
            "DELETE FROM account_links WHERE id = %s AND kind = %s AND expires_at > "
            "now() RETURNING destination",
            (link_id, kind),
        )
        .fetchone()
    )
    if link is None:
        raise ApiError(HTTPStatus.BAD_REQUEST, generic)
    return user, link["destination"]


def throttle(
    operation: str,
    maximum: int = DEFAULT_AUTH_IP_LIMIT,
    seconds: int = AUTH_RATE_WINDOW_SECONDS,
) -> None:
    """Apply an IP-based rate limit to an account operation.

    Args:
        operation (str): Bucket prefix.
        maximum (int): Requests per window.
        seconds (int): Window duration.

    Returns:
        None.
    """
    rate_limit(f"{operation}:ip:{request.remote_addr}", maximum, seconds)
