import hashlib
import re
from collections.abc import Callable
from functools import wraps
from http import HTTPStatus

from flask import current_app, g, request

from ..common.http import ApiError

COOKIE = "matcha_session"
SESSION_SECONDS = 7 * 24 * 3600
SESSION_TOKEN_BYTES = 32
SESSION_TOKEN_LENGTH = 43


def token_hash(token: str) -> bytes:
    """Hash a token for storage or comparison.

    Args:
        token (str): Plaintext token.

    Returns:
        bytes: SHA-256 digest.
    """
    return hashlib.sha256(token.encode()).digest()


def authenticate() -> None:
    """Validate the session cookie and update request identity and presence.

    Returns:
        None.
    """
    token = request.cookies.get(COOKIE, "")
    if not re.fullmatch(rf"[A-Za-z0-9_-]{{{SESSION_TOKEN_LENGTH}}}", token):
        raise ApiError(HTTPStatus.UNAUTHORIZED, "Sign in to continue.")
    digest = token_hash(token)
    # Update presence separately to avoid locking users on polls.
    with current_app.extensions["db"].connection() as connection:
        user = connection.execute(
            """WITH touched AS (
                   UPDATE sessions SET last_seen = clock_timestamp()
                   WHERE token_hash = %s AND expires_at > now()
                   RETURNING user_id
               )
               SELECT user_id FROM touched""",
            (digest,),
        ).fetchone()
    if user is None:
        raise ApiError(HTTPStatus.UNAUTHORIZED, "Sign in to continue.")
    g.session_hash = digest
    g.user_id = user["user_id"]


def signed_in[**P, R](handler: Callable[P, R]) -> Callable[P, R]:
    """Require a valid session before invoking a route handler.

    Args:
        handler (Callable[P, R]): Route function to protect.

    Returns:
        Callable[P, R]: Wrapped route handler.
    """

    @wraps(handler)
    def protected(*args: P.args, **kwargs: P.kwargs) -> R:
        """Authenticate the caller and forward the route arguments.

        Args:
            *args (P.args): Positional inputs.
            **kwargs (P.kwargs): Named inputs.

        Returns:
            R: Handler result.
        """
        authenticate()
        return handler(*args, **kwargs)

    return protected
