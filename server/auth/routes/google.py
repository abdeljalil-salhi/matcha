"""Browser routes for the Google OpenID Connect sign-in strategy."""

import hmac
import secrets
from http import HTTPStatus
from urllib.parse import urlencode

from flask import Blueprint, Response, current_app, redirect, request
from psycopg.errors import UniqueViolation

from ...common.config import GOOGLE_CALLBACK_PATH
from ...common.db import db, lock_users
from ...common.http import ApiError
from .. import google
from ..guard import COOKIE
from ..limits import (
    GOOGLE_CALLBACK_IP_LIMIT,
    GOOGLE_START_IP_LIMIT,
    MAX_USERNAME_LENGTH,
)
from ..links import throttle
from ..session import issue_session, set_session_cookie

routes = Blueprint("google", __name__)
CALLBACK_ROUTE = GOOGLE_CALLBACK_PATH.removeprefix("/api")


class PendingVerification(Exception):
    """A password account with this email has not verified its address."""


class AlreadyLinked(Exception):
    """This Google identity or Matcha account is already linked elsewhere."""


def _clear_flow_cookie(response: Response) -> Response:
    """Remove the one-use Google flow cookie from the browser.

    Args:
        response (Response): Outgoing redirect.

    Returns:
        Response: Redirect with the flow cookie cleared.
    """
    response.delete_cookie(
        google.FLOW_COOKIE,
        path=google.FLOW_COOKIE_PATH,
        httponly=True,
        secure=current_app.config["COOKIE_SECURE"],
        samesite="Lax",
    )
    return response


def _login_redirect(reason: str, next_path: str = google.DEFAULT_NEXT) -> Response:
    """Return to the login page with a compact, non-sensitive error code.

    Args:
        reason (str): Public result code for the login form.
        next_path (str): Originally requested local destination.

    Returns:
        Response: Redirect to the frontend login page.
    """
    query = {"google": reason}
    if next_path != google.DEFAULT_NEXT:
        query["next"] = next_path
    target = f"{current_app.config['FRONTEND_URL']}/login?{urlencode(query)}"
    return _clear_flow_cookie(redirect(target, code=HTTPStatus.FOUND))


def _success_redirect(next_path: str, token: str) -> Response:
    """Return to the frontend with a newly issued session cookie.

    Args:
        next_path (str): Validated local destination.
        token (str): Plaintext session token.

    Returns:
        Response: Redirect carrying the session cookie.
    """
    target = f"{current_app.config['FRONTEND_URL']}{next_path}"
    response = redirect(target, code=HTTPStatus.FOUND)
    set_session_cookie(response, token)
    return _clear_flow_cookie(response)


@routes.get("/auth/google/status")
def status() -> dict[str, bool]:
    """Report whether Google sign-in is available in this deployment.

    Returns:
        dict[str, bool]: Availability of the strategy.
    """
    return {"enabled": google.enabled()}


@routes.get("/auth/google/start")
def start() -> Response:
    """Start the Google authorization-code flow with PKCE.

    Returns:
        Response: Redirect to Google's consent screen, or to login if disabled.
    """
    next_path = google.safe_next(request.args.get("next"))
    try:
        throttle("google-start", GOOGLE_START_IP_LIMIT)
    except ApiError:
        return _login_redirect("rate_limited", next_path)
    if not google.enabled():
        return _login_redirect("unavailable", next_path)
    state, verifier = google.new_flow()
    response = redirect(
        google.authorization_url(state, google.code_challenge(verifier)),
        code=HTTPStatus.FOUND,
    )
    response.set_cookie(
        google.FLOW_COOKIE,
        google.encode_flow(state, verifier, next_path),
        max_age=google.FLOW_SECONDS,
        httponly=True,
        secure=current_app.config["COOKIE_SECURE"],
        samesite="Lax",
        path=google.FLOW_COOKIE_PATH,
    )
    return response


def _lock_identity(profile: google.GoogleProfile) -> None:
    """Serialize concurrent sign-ins for the same Google ID or email.

    Args:
        profile (google.GoogleProfile): Verified identity claims.

    Returns:
        None.
    """
    for key in sorted(
        (f"google:sub:{profile.subject}", f"google:email:{profile.email}")
    ):
        db().execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (key,))


def _create_user(profile: google.GoogleProfile) -> int:
    """Create a verified account that cannot sign in with a password.

    Args:
        profile (google.GoogleProfile): Verified identity claims.

    Returns:
        int: New account ID.

    Raises:
        AlreadyLinked: The email was claimed by a concurrent registration.
    """
    base = google.suggested_username(profile.email)
    for attempt in range(6):
        candidate = (
            base
            if attempt == 0
            else f"{base[: MAX_USERNAME_LENGTH - 7]}_{secrets.token_hex(3)}"
        )
        user = (
            db()
            .execute(
                """INSERT INTO users (username, email, first_name, last_name,
                password_hash, verified_at)
               VALUES (%s, %s, %s, %s, '!', now())
               ON CONFLICT DO NOTHING RETURNING id""",
                (candidate, profile.email, profile.first_name, profile.last_name),
            )
            .fetchone()
        )
        if user:
            return user["id"]
        if (
            db()
            .execute("SELECT 1 FROM users WHERE email = %s", (profile.email,))
            .fetchone()
        ):
            raise AlreadyLinked
    raise AlreadyLinked


def _find_user(profile: google.GoogleProfile) -> int:
    """Resolve the account for a verified Google identity.

    Args:
        profile (google.GoogleProfile): Verified identity claims.

    Returns:
        int: Existing or newly created account ID.

    Raises:
        PendingVerification: The matching local account is still unverified.
        AlreadyLinked: Another Google identity owns the matching account.
    """
    linked = (
        db()
        .execute(
            "SELECT user_id FROM oauth_accounts WHERE provider = 'google' AND "
            "provider_user_id = %s",
            (profile.subject,),
        )
        .fetchone()
    )
    if linked:
        return linked["user_id"]
    user = (
        db()
        .execute("SELECT id, verified_at FROM users WHERE email = %s", (profile.email,))
        .fetchone()
    )
    if user is None:
        return _create_user(profile)
    if user["verified_at"] is None:
        raise PendingVerification
    if (
        db()
        .execute(
            "SELECT 1 FROM oauth_accounts WHERE provider = 'google' AND user_id = %s",
            (user["id"],),
        )
        .fetchone()
    ):
        raise AlreadyLinked
    return user["id"]


def _sign_in(profile: google.GoogleProfile, previous: str | None) -> str:
    """Link the identity if needed and create a fresh session atomically.

    Args:
        profile (google.GoogleProfile): Verified identity claims.
        previous (str | None): Existing session cookie, if any.

    Returns:
        str: New session token.
    """
    with db().transaction():
        _lock_identity(profile)
        user_id = _find_user(profile)
        lock_users(user_id)
        db().execute(
            "INSERT INTO oauth_accounts (provider, provider_user_id, user_id) "
            "VALUES ('google', %s, %s) ON CONFLICT DO NOTHING",
            (profile.subject, user_id),
        )
        return issue_session(user_id, previous)


@routes.get(CALLBACK_ROUTE)
def callback() -> Response:
    """Validate Google's callback, then sign the user into Matcha.

    Returns:
        Response: Redirect to the requested page or back to login with a reason.
    """
    flow = None
    next_path = google.DEFAULT_NEXT
    value = request.cookies.get(google.FLOW_COOKIE, "")
    if value:
        flow = google.decode_flow(value)
        if flow:
            next_path = google.safe_next(flow[2])
    try:
        throttle("google-callback", GOOGLE_CALLBACK_IP_LIMIT)
    except ApiError:
        return _login_redirect("rate_limited", next_path)
    if not google.enabled():
        return _login_redirect("unavailable")
    if request.args.get("error"):
        return _login_redirect("denied", next_path)
    code = request.args.get("code", "")
    state = request.args.get("state", "")
    if (
        flow is None
        or not code
        or len(code) > google.MAX_CODE_LENGTH
        or len(state) > 128
        or not hmac.compare_digest(state.encode("utf-8"), flow[0].encode("utf-8"))
    ):
        return _login_redirect("invalid", next_path)
    try:
        access_token = google.exchange_code(code, flow[1])
    except (google.UpstreamError, ApiError):
        return _login_redirect("unavailable", next_path)
    try:
        profile = google.fetch_profile(access_token)
    except google.UpstreamError:
        return _login_redirect("unavailable", next_path)
    except (ApiError, ValueError):
        return _login_redirect("invalid", next_path)
    try:
        token = _sign_in(profile, request.cookies.get(COOKIE))
    except PendingVerification:
        return _login_redirect("pending", next_path)
    except (AlreadyLinked, UniqueViolation):
        return _login_redirect("conflict", next_path)
    return _success_redirect(next_path, token)
