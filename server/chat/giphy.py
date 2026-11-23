from __future__ import annotations

from http import HTTPStatus
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json

from flask import current_app

from ..common.http import ApiError

GIPHY_SEARCH_URL = "https://api.giphy.com/v1/gifs/search"
GIPHY_TIMEOUT_SECONDS = 6
GIPHY_DEFAULT_LIMIT = 24
GIPHY_MAX_LIMIT = 24
GIPHY_RATING = "pg-13"
ALLOWED_GIPHY_HOSTS = {
    "media.giphy.com",
    "i.giphy.com",
    "media0.giphy.com",
    "media1.giphy.com",
    "media2.giphy.com",
    "media3.giphy.com",
    "media4.giphy.com",
}


def search_gifs(query: str, limit: int = GIPHY_DEFAULT_LIMIT) -> list[dict]:
    """Search GIPHY and return normalized GIF options for the chat picker.

    Args:
        query (str): User search term.
        limit (int): Maximum number of results.

    Returns:
        list[dict]: Picker-safe GIF metadata.
    """
    key = current_app.config.get("GIPHY_API_KEY", "")
    if not key:
        raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, "GIF search is not configured.")
    limit = max(1, min(limit, GIPHY_MAX_LIMIT))
    params = urlencode(
        {
            "api_key": key,
            "q": query,
            "limit": limit,
            "rating": GIPHY_RATING,
            "lang": "en",
            "bundle": "messaging_non_clips",
        }
    )
    request = Request(
        f"{GIPHY_SEARCH_URL}?{params}",
        headers={"Accept": "application/json", "User-Agent": "matcha-chat/1.0"},
    )
    try:
        with urlopen(request, timeout=GIPHY_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code == 429:
            raise ApiError(
                HTTPStatus.TOO_MANY_REQUESTS,
                "GIF search is temporarily rate limited. Try again shortly.",
            ) from None
        raise ApiError(HTTPStatus.BAD_GATEWAY, "GIF search is unavailable.") from None
    except (URLError, TimeoutError, ValueError, OSError):
        raise ApiError(HTTPStatus.BAD_GATEWAY, "GIF search is unavailable.") from None

    gifs = []
    for item in payload.get("data", []):
        gif = normalize_gif(item)
        if gif:
            gifs.append(gif)
    return gifs


def normalize_gif(item: dict) -> dict | None:
    """Map a GIPHY API object to the fields the frontend needs.

    Args:
        item (dict): Raw GIPHY GIF object.

    Returns:
        dict | None: Normalized GIF, or None when required fields are missing.
    """
    images = item.get("images") or {}
    original = images.get("original") or {}
    preview = images.get("fixed_width_small") or images.get("fixed_width") or original
    url = allowed_giphy_url(original.get("url"))
    preview_url = allowed_giphy_url(preview.get("url")) or url
    if not url or not preview_url:
        return None
    width = _dimension(preview.get("width") or original.get("width"))
    height = _dimension(preview.get("height") or original.get("height"))
    title = str(item.get("title") or "GIF").strip()[:120] or "GIF"
    return {
        "id": str(item.get("id") or ""),
        "title": title,
        "url": url,
        "preview_url": preview_url,
        "width": width,
        "height": height,
    }


def allowed_giphy_url(value: object) -> str | None:
    """Allow only HTTPS GIPHY media URLs.

    Args:
        value (object): Candidate URL.

    Returns:
        str | None: Clean URL or None.
    """
    if not isinstance(value, str):
        return None
    url = value.strip()
    if not url.startswith("https://"):
        return None
    host = url.split("/")[2].lower() if "/" in url[8:] else url[8:].lower()
    host = host.split(":")[0]
    if host not in ALLOWED_GIPHY_HOSTS and not host.endswith(".giphy.com"):
        return None
    return url[:2048]


def _dimension(value: object) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if 1 <= number <= 4096 else None
