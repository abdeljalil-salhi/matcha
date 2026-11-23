import secrets

from flask import Response, current_app

from ..common.db import db
from .guard import COOKIE, SESSION_SECONDS, SESSION_TOKEN_BYTES, token_hash


def issue_session(user_id: int, previous: str | None = None) -> str:
    """Replace the previous browser session and create a fresh one.

    Args:
        user_id (int): Authenticated account ID.
        previous (str | None): Cookie token from the incoming request, if any.

    Returns:
        str: New plaintext session token for the response cookie.
    """
    if previous:
        db().execute(
            "DELETE FROM sessions WHERE token_hash = %s", (token_hash(previous),)
        )
    token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    db().execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (%s, %s, "
        "now() + %s * interval '1 second')",
        (token_hash(token), user_id, SESSION_SECONDS),
    )
    return token


def set_session_cookie(response: Response, token: str) -> Response:
    """Attach the HttpOnly session cookie shared by every sign-in strategy.

    Args:
        response (Response): Outgoing response.
        token (str): Plaintext session token.

    Returns:
        Response: Response carrying the session cookie.
    """
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=current_app.config["COOKIE_SECURE"],
        samesite="Lax",
    )
    return response
