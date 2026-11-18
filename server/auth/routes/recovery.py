from http import HTTPStatus

from flask import Blueprint

from ...common.db import db
from ...common.http import rate_limit
from ...common.request_data import object_body, require_string
from ..guard import token_hash
from ..links import consume_link, queue_link, throttle
from ..passwords import hasher
from ..types import Accepted
from ..validation import email_address, password
from ..limits import (
    AUTH_RATE_WINDOW_SECONDS,
    RESET_CONFIRM_IP_LIMIT,
    RESET_LINK_TTL_MINUTES,
    RESET_REQUEST_EMAIL_LIMIT,
)

routes = Blueprint("recovery", __name__)


@routes.post("/auth/forgot-password")
def forgot() -> tuple[Accepted, int]:
    """Queue a reset email for an eligible account, if one exists.

    Args:
        Request body (JSON):
            email (str): Address associated with the account.

    Returns:
        tuple[Accepted, int]: Generic acceptance payload and HTTP 202.
    """
    throttle("forgot")
    data = object_body("email", required=("email",))
    address = email_address(require_string(data["email"], "email"))
    rate_limit(
        f"forgot:email:{token_hash(address).hex()}",
        RESET_REQUEST_EMAIL_LIMIT,
        AUTH_RATE_WINDOW_SECONDS,
    )
    with db().transaction():
        user = (
            db()
            .execute(
                "SELECT id FROM users WHERE email = %s AND verified_at IS NOT NULL "
                "AND NOT is_demo FOR UPDATE",
                (address,),
            )
            .fetchone()
        )
        if user:
            queue_link(user["id"], "reset", address, RESET_LINK_TTL_MINUTES)
    return {"status": "accepted"}, HTTPStatus.ACCEPTED


@routes.post("/auth/reset-password")
def reset() -> tuple[str, int]:
    """Change the password and revoke existing sessions.

    Args:
        Request body (JSON):
            token (str): Password reset token.
            password (str): New password.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    throttle("reset", RESET_CONFIRM_IP_LIMIT)
    data = object_body("token", "password", required=("token", "password"))
    with db().transaction():
        user, _ = consume_link(require_string(data["token"], "token"), "reset")
        phrase = password(
            require_string(data["password"], "password"),
            (user["username"], user["first_name"], user["last_name"]),
        )
        db().execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (hasher.hash(phrase), user["id"]),
        )
        db().execute("DELETE FROM sessions WHERE user_id = %s", (user["id"],))
        db().execute(
            "DELETE FROM account_links WHERE user_id = %s AND kind = 'email'",
            (user["id"],),
        )
    return "", HTTPStatus.NO_CONTENT
