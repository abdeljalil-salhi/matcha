from http import HTTPStatus

from argon2 import exceptions
from flask import Blueprint, g
from psycopg import errors

from ...common.db import db, lock_users
from ...common.http import ApiError
from ...common.request_data import object_body, require_string
from ...common.validation import text
from ..guard import signed_in
from ..links import consume_link, queue_link, throttle
from ..passwords import hasher
from ..types import VerificationQueued
from ..validation import email_address
from ..limits import (
    EMAIL_CHANGE_CONFIRM_IP_LIMIT,
    EMAIL_CHANGE_LINK_TTL_MINUTES,
    MAX_PASSWORD_LENGTH,
)

routes = Blueprint("email_change", __name__)


@routes.post("/me/email-change")
@signed_in
def change_email() -> tuple[VerificationQueued, int]:
    """Verify the current password and queue confirmation to the new email.

    Args:
        Request body (JSON):
            email (str): New email address.
            password (str): Current account password.

    Returns:
        tuple[VerificationQueued, int]: Queue status and HTTP 202.
    """
    throttle("email-change")
    data = object_body("email", "password", required=("email", "password"))
    address = email_address(require_string(data["email"], "email"))
    phrase = text(
        require_string(data["password"], "password"),
        "password",
        MAX_PASSWORD_LENGTH,
        strip=False,
    )
    with db().transaction():
        user = lock_users(g.user_id)[0]
        if user["is_demo"]:
            raise ApiError(
                HTTPStatus.FORBIDDEN, "Demo accounts cannot change their email."
            )
        try:
            hasher.verify(user["password_hash"], phrase)
        except exceptions.VerifyMismatchError:
            raise ApiError(
                HTTPStatus.FORBIDDEN, "The current password is incorrect."
            ) from None
        if address == user["email"]:
            raise ApiError(
                HTTPStatus.UNPROCESSABLE_ENTITY, "Enter a different email address."
            )
        if db().execute("SELECT 1 FROM users WHERE email = %s", (address,)).fetchone():
            raise ApiError(HTTPStatus.CONFLICT, "That email is unavailable.")
        queue_link(g.user_id, "email", address, EMAIL_CHANGE_LINK_TTL_MINUTES)
    return {"status": "verification_queued"}, HTTPStatus.ACCEPTED


@routes.post("/auth/confirm-email")
def confirm_email() -> tuple[str, int]:
    """Consume an email-change link and update the account address.

    Args:
        Request body (JSON):
            token (str): Email change confirmation token.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    throttle("confirm-email", EMAIL_CHANGE_CONFIRM_IP_LIMIT)
    data = object_body("token", required=("token",))
    try:
        with db().transaction():
            user, address = consume_link(
                require_string(data["token"], "token"), "email"
            )
            db().execute(
                "UPDATE users SET email = %s WHERE id = %s", (address, user["id"])
            )
            db().execute(
                "DELETE FROM account_links WHERE user_id = %s AND kind = 'reset'",
                (user["id"],),
            )
    except errors.UniqueViolation:
        raise ApiError(
            HTTPStatus.CONFLICT, "That email is no longer available."
        ) from None
    return "", HTTPStatus.NO_CONTENT
