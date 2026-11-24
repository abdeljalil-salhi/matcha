import os
from urllib.parse import urlsplit

from dotenv import load_dotenv
from psycopg.conninfo import make_conninfo

from .types import Settings
from ..profiles.limits import MAX_PHOTO_BYTES

MIN_TURN_SECRET_LENGTH = 32

MULTIPART_OVERHEAD_BYTES = 16 * 1024
# Allow a 64 KiB parser chunk plus retained multipart boundary bytes.
MAX_FORM_MEMORY_BYTES = 128 * 1024
MAX_MULTIPART_PARTS = 4
GOOGLE_SETTING_KEYS = (
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
)
GOOGLE_CALLBACK_PATH = "/api/auth/google/callback"


def _origin(value: str, name: str) -> str:
    """Parse and validate an HTTP(S) browser origin.

    Args:
        value (str): Origin string to validate.
        name (str): Setting name used in errors.

    Returns:
        str: Canonical ``scheme://netloc`` origin.
    """
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError(f"{name} must be an HTTP(S) origin.")
    return f"{parsed.scheme}://{parsed.netloc}"


def google_settings() -> dict[str, str]:
    """Read and validate the optional Google sign-in credentials.

    Returns:
        dict[str, str]: Google client ID, secret, and redirect URI.
    """
    values = {key: os.environ.get(key, "").strip() for key in GOOGLE_SETTING_KEYS}
    if any(values.values()) and not all(values.values()):
        raise RuntimeError(
            "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI must be "
            "set together."
        )
    redirect = urlsplit(values["GOOGLE_REDIRECT_URI"])
    if values["GOOGLE_REDIRECT_URI"] and (
        redirect.scheme not in {"http", "https"}
        or not redirect.hostname
        or redirect.username
        or redirect.password
        or redirect.path != GOOGLE_CALLBACK_PATH
        or redirect.query
        or redirect.fragment
    ):
        raise RuntimeError(
            "GOOGLE_REDIRECT_URI must be an absolute HTTP(S) URL ending in "
            f"{GOOGLE_CALLBACK_PATH}."
        )
    return values


def settings() -> Settings:
    """Load environment settings and validate the frontend origin.

    Returns:
        Settings: Flask configuration and database connection settings.
    """
    load_dotenv()

    frontend_url = _origin(
        os.environ.get("FRONTEND_URL", "http://localhost:5173"), "FRONTEND_URL"
    )
    allowed_origins = [frontend_url]
    for raw in os.environ.get("ALLOWED_ORIGINS", "").split(","):
        value = raw.strip()
        if value and (item := _origin(value, "ALLOWED_ORIGINS")) not in allowed_origins:
            allowed_origins.append(item)
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        dsn = make_conninfo(
            host="db",
            dbname=os.environ["POSTGRES_DB"],
            user=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
        )
        if not os.environ["POSTGRES_PASSWORD"]:
            raise RuntimeError("POSTGRES_PASSWORD is required.")
    turn_urls = [
        url.strip()
        for url in os.environ.get("CALL_TURN_URLS", "").split(",")
        if url.strip()
    ]
    stun_urls = [
        url.strip()
        for url in os.environ.get("CALL_STUN_URLS", "").split(",")
        if url.strip()
    ]
    turn_secret = os.environ.get("CALL_TURN_SECRET", "")
    relay_only = os.environ.get("CALL_RELAY_ONLY", "false").lower() == "true"
    if any(not url.startswith(("turn:", "turns:")) for url in turn_urls):
        raise RuntimeError("CALL_TURN_URLS must contain TURN URLs.")
    if any(not url.startswith(("stun:", "stuns:")) for url in stun_urls):
        raise RuntimeError("CALL_STUN_URLS must contain STUN URLs.")
    if turn_urls and len(turn_secret) < MIN_TURN_SECRET_LENGTH:
        raise RuntimeError("CALL_TURN_SECRET must contain at least 32 characters.")
    if relay_only and not turn_urls:
        raise RuntimeError("Relay-only calls require CALL_TURN_URLS.")
    return {
        "DATABASE_URL": dsn,
        "MATCHA_SECRET": os.environ.get("MATCHA_SECRET", ""),
        "FRONTEND_URL": frontend_url,
        "ALLOWED_ORIGINS": allowed_origins,
        **google_settings(),
        "COOKIE_SECURE": os.environ.get("COOKIE_SECURE", "true").lower() != "false",
        "MAX_CONTENT_LENGTH": MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES,
        "MAX_FORM_MEMORY_SIZE": MAX_FORM_MEMORY_BYTES,
        "MAX_FORM_PARTS": MAX_MULTIPART_PARTS,
        "RATELIMIT": True,
        "CALL_STUN_URLS": stun_urls,
        "CALL_TURN_URLS": turn_urls,
        "CALL_TURN_SECRET": turn_secret,
        "CALL_RELAY_ONLY": relay_only,
        "GIPHY_API_KEY": os.environ.get("GIPHY_API_KEY", "").strip(),
    }
