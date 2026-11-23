import json
from pathlib import Path

from .types import Place

# Shared with the frontend so the manual picker, map pins, and API resolve the
# same offline places. Featured entries are the demo fixtures also used to
# weight seeded profiles toward the places evaluators are most likely to see.
PLACES_FILE = Path(__file__).resolve().parents[2] / "data" / "places.json"


def _load_places() -> tuple[tuple[Place, ...], frozenset[Place]]:
    with PLACES_FILE.open(encoding="utf-8") as stream:
        payload = json.load(stream)
    places: list[Place] = []
    featured: set[Place] = set()
    for item in payload["places"]:
        place = (
            item["city"],
            item.get("area"),
            item["country_code"],
            item["latitude"],
            item["longitude"],
        )
        places.append(place)
        if item.get("featured"):
            featured.add(place)
    return tuple(places), frozenset(featured)


PLACES, FEATURED_PLACES = _load_places()
