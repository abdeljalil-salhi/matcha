import os
from urllib.parse import urlsplit

from dotenv import load_dotenv
from psycopg.conninfo import make_conninfo

from .types import Settings
from ..profiles.limits import MAX_PHOTO_BYTES

MULTIPART_OVERHEAD_BYTES = 16 * 1024
MAX_FORM_MEMORY_BYTES = 64 * 1024
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
    return {
        "DATABASE_URL": dsn,
        "MATCHA_SECRET": os.environ.get("MATCHA_SECRET", ""),
        "FRONTEND_URL": f"{frontend.scheme}://{frontend.netloc}",
        "COOKIE_SECURE": os.environ.get("COOKIE_SECURE", "true").lower() != "false",
        "MAX_CONTENT_LENGTH": MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES,
        "MAX_FORM_MEMORY_SIZE": MAX_FORM_MEMORY_BYTES,
        "MAX_FORM_PARTS": MAX_MULTIPART_PARTS,
        "RATELIMIT": True,
    }
