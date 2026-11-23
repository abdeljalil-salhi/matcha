from typing import TypedDict

type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[
    str, JsonValue
]
type JsonObject = dict[str, JsonValue]


class Settings(TypedDict):
    """Environment-backed application settings."""

    DATABASE_URL: str
    MATCHA_SECRET: str
    FRONTEND_URL: str
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str
    COOKIE_SECURE: bool
    MAX_CONTENT_LENGTH: int
    MAX_FORM_MEMORY_SIZE: int
    MAX_FORM_PARTS: int
    RATELIMIT: bool
