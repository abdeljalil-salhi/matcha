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
        "FRONTEND_URL": f"{frontend.scheme}://{frontend.netloc}",
        "COOKIE_SECURE": os.environ.get("COOKIE_SECURE", "true").lower() != "false",
        "MAX_CONTENT_LENGTH": MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES,
        "MAX_FORM_MEMORY_SIZE": MAX_FORM_MEMORY_BYTES,
        "MAX_FORM_PARTS": MAX_MULTIPART_PARTS,
        "RATELIMIT": True,
        "CALL_STUN_URLS": stun_urls,
        "CALL_TURN_URLS": turn_urls,
        "CALL_TURN_SECRET": turn_secret,
        "CALL_RELAY_ONLY": relay_only,
    }
