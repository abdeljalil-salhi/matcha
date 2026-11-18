import secrets
from http import HTTPStatus

from argon2 import exceptions
from flask import Blueprint, Response, current_app, g, make_response, request

from ...common.db import db, lock_users
from ...common.http import ApiError, rate_limit
from ...common.request_data import object_body, require_string
from ...common.validation import text
from ..guard import COOKIE, SESSION_SECONDS, SESSION_TOKEN_BYTES, signed_in, token_hash
from ..links import throttle
from ..passwords import DUMMY_HASH, hasher
from ..validation import username
from ..limits import (
    AUTH_RATE_WINDOW_SECONDS,
    LOGIN_IP_LIMIT,
    LOGIN_USERNAME_LIMIT,
    MAX_PASSWORD_LENGTH,
)

routes = Blueprint("sessions", __name__)


@routes.post("/auth/login")
def login() -> Response:
    """Check verified credentials and issue a new session cookie.

    Args:
        Request body (JSON):
            username (str): Account username.
            password (str): Account password.

    Returns:
        Response: Account ID and username with the session cookie.
    """
    throttle("login", LOGIN_IP_LIMIT)
    data = object_body("username", "password", required=("username", "password"))
    name = username(require_string(data["username"], "username"))
    phrase = text(
        require_string(data["password"], "password"),
        "password",
        MAX_PASSWORD_LENGTH,
        strip=False,
    )
    rate_limit(f"login:user:{name}", LOGIN_USERNAME_LIMIT, AUTH_RATE_WINDOW_SECONDS)
    with db().transaction():
        user = (
            db()
            .execute(
                "SELECT id, username, password_hash, verified_at FROM users WHERE "
                "username = %s",
                (name,),
            )
            .fetchone()
        )
        try:
            hasher.verify(
                (
                    user["password_hash"]
                    if user and user["password_hash"] != "!"
                    else DUMMY_HASH
                ),
                phrase,
            )
        except exceptions.VerifyMismatchError:
            raise ApiError(
                HTTPStatus.UNAUTHORIZED, "Username or password is incorrect."
            ) from None
        if user is None or user["password_hash"] == "!":
            raise ApiError(
                HTTPStatus.UNAUTHORIZED, "Username or password is incorrect."
            )
        fresh = lock_users(user["id"])[0]
        if fresh["password_hash"] != user["password_hash"]:
            raise ApiError(
                HTTPStatus.UNAUTHORIZED, "Username or password is incorrect."
            )
        if fresh["verified_at"] is None:
            raise ApiError(HTTPStatus.FORBIDDEN, "Verify your email before signing in.")
        previous = request.cookies.get(COOKIE)
        if previous:
            db().execute(
                "DELETE FROM sessions WHERE token_hash = %s", (token_hash(previous),)
            )
        token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
        db().execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (%s, %s, "
            "now() + %s * interval '1 second')",
            (token_hash(token), user["id"], SESSION_SECONDS),
        )
    response = make_response({"id": user["id"], "username": name})
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=current_app.config["COOKIE_SECURE"],
        samesite="Lax",
    )
    return response


@routes.post("/auth/logout")
@signed_in
def logout() -> Response:
    """Revoke the current session and clear its cookie.

    Returns:
        Response: Empty HTTP 204 response with the cookie cleared.
    """
    with db().transaction():
        lock_users(g.user_id)
        db().execute(
            """UPDATE users SET last_seen = greatest(last_seen, (SELECT last_seen FROM
                sessions WHERE token_hash = %s))
               WHERE id = %s""",
            (g.session_hash, g.user_id),
        )
        db().execute("DELETE FROM sessions WHERE token_hash = %s", (g.session_hash,))
    response = make_response("", HTTPStatus.NO_CONTENT)
    response.delete_cookie(
        COOKIE,
        httponly=True,
        secure=current_app.config["COOKIE_SECURE"],
        samesite="Lax",
    )
    return response
