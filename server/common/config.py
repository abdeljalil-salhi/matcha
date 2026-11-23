import os
from urllib.parse import urlsplit

from dotenv import load_dotenv
from psycopg.conninfo import make_conninfo

from .types import Settings
from ..profiles.limits import MAX_PHOTO_BYTES

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
    frontend = urlsplit(os.environ.get("FRONTEND_URL", "http://localhost:5173"))
    if (
        frontend.scheme not in {"http", "https"}
        or not frontend.hostname
        or frontend.username
        or frontend.password
        or frontend.path not in {"", "/"}
        or frontend.query
        or frontend.fragment
    ):
        raise RuntimeError("FRONTEND_URL must be an HTTP(S) origin.")
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
    return {
        "DATABASE_URL": dsn,
        "MATCHA_SECRET": os.environ.get("MATCHA_SECRET", ""),
        "FRONTEND_URL": f"{frontend.scheme}://{frontend.netloc}",
        **google_settings(),
        "COOKIE_SECURE": os.environ.get("COOKIE_SECURE", "true").lower() != "false",
        "MAX_CONTENT_LENGTH": MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES,
        "MAX_FORM_MEMORY_SIZE": MAX_FORM_MEMORY_BYTES,
        "MAX_FORM_PARTS": MAX_MULTIPART_PARTS,
        "RATELIMIT": True,
    }
