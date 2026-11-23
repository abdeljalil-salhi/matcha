"""Google OpenID Connect strategy for the Matcha session backend.

The browser only ever sees an authorization redirect. Codes are exchanged
server-side with PKCE, the profile is read from Google's userinfo endpoint, and
the result is converted into the same HttpOnly session used by password login.
"""

import base64
import hashlib
import json
import re
import secrets
import unicodedata
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from flask import current_app
from itsdangerous import BadSignature, URLSafeTimedSerializer

from ..common.http import ApiError
from ..profiles.limits import MAX_NAME_LENGTH
from .limits import MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH
from .validation import email_address, username as validate_username

AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
SCOPES = "openid email profile"

HTTP_TIMEOUT_SECONDS = 6
MAX_CODE_LENGTH = 2048
MAX_TOKEN_LENGTH = 4096
MAX_SUBJECT_LENGTH = 255
MAX_NEXT_LENGTH = 200
FLOW_SECONDS = 10 * 60
FLOW_COOKIE = "matcha_google_flow"
FLOW_COOKIE_PATH = "/api/auth/google"
DEFAULT_NEXT = "/discover"


class UpstreamError(Exception):
    """Google could not complete the token exchange or profile lookup."""


@dataclass(frozen=True)
class GoogleProfile:
    """Verified identity claims returned by Google."""

    subject: str
    email: str
    first_name: str
    last_name: str


class _NoRedirect(HTTPRedirectHandler):
    """Refuse redirects so bearer tokens cannot follow an off-host URL."""

    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        """Raise instead of following an upstream redirect.

        Args:
            req (Request): Original request.
            fp (Any): Response body.
            code (int): Redirect status.
            msg (str): Redirect reason.
            headers (Any): Response headers.
            newurl (str): Redirect destination.

        Returns:
            None: This method always raises.

        Raises:
            HTTPError: The redirect was refused.
        """
        raise HTTPError(newurl, code, "Redirect refused.", headers, fp)


def enabled() -> bool:
    """Report whether all Google credentials are present.

    Returns:
        bool: True when the strategy can be used.
    """
    return all(
        isinstance(current_app.config.get(key), str) and current_app.config.get(key)
        for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI")
    )


def google_config() -> tuple[str, str, str]:
    """Read the configured Google client credentials.

    Returns:
        tuple[str, str, str]: Client ID, client secret, and redirect URI.

    Raises:
        ApiError: The strategy is not configured.
    """
    if not enabled():
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE, "Google sign-in is not configured."
        )
    return (
        current_app.config["GOOGLE_CLIENT_ID"],
        current_app.config["GOOGLE_CLIENT_SECRET"],
        current_app.config["GOOGLE_REDIRECT_URI"],
    )


def new_flow() -> tuple[str, str]:
    """Create an anti-CSRF state value and a PKCE verifier.

    Returns:
        tuple[str, str]: State and PKCE verifier.
    """
    return secrets.token_urlsafe(32), secrets.token_urlsafe(64)


def code_challenge(verifier: str) -> str:
    """Derive the S256 PKCE challenge sent to Google.

    Args:
        verifier (str): High-entropy PKCE verifier.

    Returns:
        str: Unpadded base64url-encoded challenge.
    """
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def authorization_url(state: str, challenge: str) -> str:
    """Build the Google consent-screen URL for this flow.

    Args:
        state (str): Anti-CSRF state value.
        challenge (str): S256 PKCE challenge.

    Returns:
        str: Google authorization URL.
    """
    client_id, _, redirect_uri = google_config()
    parameters = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "online",
    }
    return f"{AUTHORIZATION_ENDPOINT}?{urlencode(parameters)}"


def encode_flow(state: str, verifier: str, next_path: str) -> str:
    """Sign the short-lived flow cookie carried through the redirect.

    Args:
        state (str): Anti-CSRF state value.
        verifier (str): PKCE verifier.
        next_path (str): Validated local destination after sign-in.

    Returns:
        str: Signed cookie value.
    """
    serializer = URLSafeTimedSerializer(
        current_app.config["MATCHA_SECRET"], salt=FLOW_COOKIE
    )
    return serializer.dumps({"s": state, "v": verifier, "n": next_path})


def decode_flow(value: str) -> tuple[str, str, str] | None:
    """Verify and unpack the flow cookie.

    Args:
        value (str): Signed cookie value from the browser.

    Returns:
        tuple[str, str, str] | None: State, verifier, and destination, or None.
    """
    serializer = URLSafeTimedSerializer(
        current_app.config["MATCHA_SECRET"], salt=FLOW_COOKIE
    )
    try:
        payload = serializer.loads(value, max_age=FLOW_SECONDS)
    except (BadSignature, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    state, verifier, next_path = (
        payload.get("s"),
        payload.get("v"),
        payload.get("n"),
    )
    if not all(isinstance(item, str) for item in (state, verifier, next_path)):
        return None
    if len(state) > 128 or len(verifier) > 128 or len(next_path) > MAX_NEXT_LENGTH:
        return None
    return state, verifier, next_path


def safe_next(value: str | None) -> str:
    """Allow only local path redirects after sign-in.

    Args:
        value (str | None): Requested destination.

    Returns:
        str: The destination, or the default page when it is unsafe.
    """
    if not value or len(value) > MAX_NEXT_LENGTH:
        return DEFAULT_NEXT
    parts = urlsplit(value)
    if (
        not value.startswith("/")
        or value.startswith("//")
        or "\\" in value
        or parts.scheme
        or parts.netloc
        or any(ord(char) < 32 for char in value)
    ):
        return DEFAULT_NEXT
    return value


def _json_response(request: Request) -> dict[str, Any]:
    """Read a JSON object from a fixed Google endpoint.

    Args:
        request (Request): Prepared HTTP request.

    Returns:
        dict[str, Any]: Decoded JSON object.

    Raises:
        UpstreamError: The response was unavailable or not a JSON object.
    """
    try:
        with build_opener(_NoRedirect).open(
            request, timeout=HTTP_TIMEOUT_SECONDS
        ) as response:
            payload = json.load(response)
    except (OSError, ValueError) as error:
        raise UpstreamError from error
    if not isinstance(payload, dict):
        raise UpstreamError
    return payload


def exchange_code(code: str, verifier: str) -> str:
    """Exchange an authorization code for a Google access token.

    Args:
        code (str): Authorization code from the callback.
        verifier (str): PKCE verifier from the flow cookie.

    Returns:
        str: Google access token.

    Raises:
        UpstreamError: The exchange failed or returned an unexpected token.
    """
    client_id, client_secret, redirect_uri = google_config()
    fields = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": verifier,
    }
    request = Request(
        TOKEN_ENDPOINT,
        data=urlencode(fields).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    payload = _json_response(request)
    token = payload.get("access_token")
    token_type = payload.get("token_type", "Bearer")
    if (
        not isinstance(token, str)
        or not token
        or len(token) > MAX_TOKEN_LENGTH
        or not isinstance(token_type, str)
        or token_type.lower() != "bearer"
    ):
        raise UpstreamError
    return token


def _clean_name(value: object, fallback: str) -> str:
    """Keep a Google name field within the account's name limits.

    Args:
        value (object): Raw claim.
        fallback (str): Value to use when the claim is absent or unusable.

    Returns:
        str: Sanitized name.
    """
    if isinstance(value, str):
        cleaned = "".join(
            char for char in value.strip() if unicodedata.category(char)[0] != "C"
        )[:MAX_NAME_LENGTH].strip()
        if cleaned:
            return cleaned
    return fallback[:MAX_NAME_LENGTH]


def read_profile(payload: dict[str, Any]) -> GoogleProfile:
    """Validate the identity claims needed to authenticate an account.

    Args:
        payload (dict[str, Any]): Google userinfo response.

    Returns:
        GoogleProfile: Verified identity.

    Raises:
        ValueError: A required claim is missing or invalid.
        ApiError: The email address fails Matcha's validation rules.
    """
    subject = payload.get("sub")
    raw_email = payload.get("email")
    if (
        not isinstance(subject, str)
        or not subject
        or len(subject) > MAX_SUBJECT_LENGTH
        or any(ord(char) < 32 for char in subject)
        or payload.get("email_verified") is not True
        or not isinstance(raw_email, str)
    ):
        raise ValueError("Google did not return a verified identity.")
    address = email_address(raw_email)
    local = re.sub(r"[._+-]+", " ", address.split("@", 1)[0]).strip().title()
    return GoogleProfile(
        subject=subject,
        email=address,
        first_name=_clean_name(payload.get("given_name"), local or "Google"),
        last_name=_clean_name(payload.get("family_name"), "User"),
    )


def fetch_profile(token: str) -> GoogleProfile:
    """Read the verified profile associated with a Google access token.

    Args:
        token (str): Google access token.

    Returns:
        GoogleProfile: Verified identity.
    """
    request = Request(
        USERINFO_ENDPOINT,
        headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
        method="GET",
    )
    return read_profile(_json_response(request))


def suggested_username(address: str) -> str:
    """Build a valid Matcha username from an email local part.

    Args:
        address (str): Verified email address.

    Returns:
        str: Valid username candidate.
    """
    local = address.split("@", 1)[0].casefold()
    base = re.sub(r"[^a-z0-9_]", "_", local)
    base = re.sub(r"_+", "_", base).strip("_")[:MAX_USERNAME_LENGTH]
    while len(base) < MIN_USERNAME_LENGTH:
        base += secrets.choice("abcdefghijklmnopqrstuvwxyz0123456789")
    return validate_username(base)
