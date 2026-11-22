import json
from pathlib import Path

from .types import Place

# Shared with the frontend so the manual picker, map pins, and API resolve the
# same offline places. The first entries are the featured development fixtures.
PLACES_FILE = Path(__file__).resolve().parents[2] / "data" / "places.json"


def _load_places() -> tuple[Place, ...]:
    with PLACES_FILE.open(encoding="utf-8") as stream:
        payload = json.load(stream)
    return tuple(
        (
            item["city"],
            item.get("area"),
            item["country_code"],
            item["latitude"],
            item["longitude"],
        )
        for item in payload["places"]
    )


PLACES: tuple[Place, ...] = _load_places()
