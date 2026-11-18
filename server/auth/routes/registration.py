from http import HTTPStatus

from flask import Blueprint

from ...common.db import db
from ...common.http import ApiError, rate_limit
from ...common.request_data import object_body, require_string
from ...common.validation import text
from ..guard import token_hash
from ..links import consume_link, queue_link, throttle
from ..passwords import hasher
from ..types import Accepted, VerificationQueued
from ..validation import email_address, password, username
from ..limits import (
    AUTH_RATE_WINDOW_SECONDS,
    VERIFICATION_LINK_TTL_MINUTES,
    VERIFICATION_RESEND_EMAIL_LIMIT,
    VERIFY_IP_LIMIT,
)
from ...profiles.limits import MAX_NAME_LENGTH

routes = Blueprint("registration", __name__)


@routes.post("/auth/register")
def register() -> tuple[VerificationQueued, int]:
    """Create an account and queue its verification email.

    Args:
        Request body (JSON):
            username (str): Desired username.
            email (str): Account email address.
            first_name (str): Given name.
            last_name (str): Family name.
            password (str): New account password.

    Returns:
        tuple[VerificationQueued, int]: Queue status and HTTP 201.
    """
    throttle("register")
    fields = ("username", "email", "first_name", "last_name", "password")
    data = object_body(*fields, required=fields)
    name = username(require_string(data["username"], "username"))
    address = email_address(require_string(data["email"], "email"))
    first = text(
        require_string(data["first_name"], "first_name"), "first_name", MAX_NAME_LENGTH
    )
    last = text(
        require_string(data["last_name"], "last_name"), "last_name", MAX_NAME_LENGTH
    )
    phrase = password(
        require_string(data["password"], "password"),
        (name, first, last, address.split("@")[0]),
    )
    encrypted = hasher.hash(phrase)
    with db().transaction():
        user = (
            db()
            .execute(
                """INSERT INTO users (username, email, first_name, last_name,
                    password_hash)
               VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING id""",
                (name, address, first, last, encrypted),
            )
            .fetchone()
        )
        if user is None:
            raise ApiError(
                HTTPStatus.CONFLICT, "That username or email is unavailable."
            )
        queue_link(user["id"], "verify", address, VERIFICATION_LINK_TTL_MINUTES)
    return {"status": "verification_queued"}, HTTPStatus.CREATED


@routes.post("/auth/resend-verification")
def resend() -> tuple[Accepted, int]:
    """Reissue verification for an unverified account, if one exists.

    Args:
        Request body (JSON):
            email (str): Address to send a new verification link to.

    Returns:
        tuple[Accepted, int]: Generic acceptance payload and HTTP 202.
    """
    throttle("resend")
    data = object_body("email", required=("email",))
    address = email_address(require_string(data["email"], "email"))
    rate_limit(
        f"resend:email:{token_hash(address).hex()}",
        VERIFICATION_RESEND_EMAIL_LIMIT,
        AUTH_RATE_WINDOW_SECONDS,
    )
    with db().transaction():
        user = (
            db()
            .execute(
                "SELECT id FROM users WHERE email = %s AND verified_at IS NULL FOR "
                "UPDATE",
                (address,),
            )
            .fetchone()
        )
        if user:
            queue_link(user["id"], "verify", address, VERIFICATION_LINK_TTL_MINUTES)
    return {"status": "accepted"}, HTTPStatus.ACCEPTED


@routes.post("/auth/verify")
def verify() -> tuple[str, int]:
    """Consume a verification link and activate the account.

    Args:
        Request body (JSON):
            token (str): Account verification token.

    Returns:
        tuple[str, int]: Empty body and HTTP 204.
    """
    throttle("verify", VERIFY_IP_LIMIT)
    data = object_body("token", required=("token",))
    with db().transaction():
        user, _ = consume_link(require_string(data["token"], "token"), "verify")
        db().execute(
            "UPDATE users SET verified_at = now() WHERE id = %s", (user["id"],)
        )
    return "", HTTPStatus.NO_CONTENT
