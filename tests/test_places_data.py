"""Validate the offline place catalog shared by the API and the frontend."""

import json
import math
import re
from pathlib import Path

import pytest

from server.location.places import FEATURED_PLACES, PLACES, PLACES_FILE

COUNTRY_CODE = re.compile(r"^[A-Z]{2}$")
FIELDS = {
    "city",
    "area",
    "country_code",
    "country",
    "latitude",
    "longitude",
    "featured",
}


def _records() -> list[dict]:
    with PLACES_FILE.open(encoding="utf-8") as stream:
        return json.load(stream)["places"]


RECORDS = _records()


def _tuple(place: dict) -> tuple:
    return (
        place["city"],
        place.get("area"),
        place["country_code"],
        place["latitude"],
        place["longitude"],
    )


@pytest.mark.parametrize(
    "place",
    RECORDS,
    ids=lambda place: f"{place['city']}/{place['area']}/{place['country_code']}",
)
def test_place_record_is_valid(place: dict) -> None:
    """Every record is complete, typed, and geographically within bounds."""
    assert set(place) <= FIELDS
    assert {"city", "area", "country_code", "country", "latitude", "longitude"} <= set(
        place
    )
    for field in ("city", "country_code", "country"):
        assert isinstance(place[field], str) and place[field].strip()
    assert COUNTRY_CODE.fullmatch(place["country_code"])
    assert place["area"] is None or (
        isinstance(place["area"], str) and place["area"].strip()
    )
    assert "featured" not in place or isinstance(place["featured"], bool)
    for field, low, high in (("latitude", -90, 90), ("longitude", -180, 180)):
        value = place[field]
        assert isinstance(value, (int, float)) and not isinstance(value, bool)
        assert math.isfinite(value) and low <= value <= high


def test_catalog_has_unique_places_and_consistent_country_labels() -> None:
    """Keys are unique and one country code always has the same country name."""
    assert len(RECORDS) > 200
    keys = [(place["city"], place["area"], place["country_code"]) for place in RECORDS]
    assert len(keys) == len(set(keys))
    labels: dict[str, str] = {}
    for place in RECORDS:
        code = place["country_code"]
        assert labels.setdefault(code, place["country"]) == place["country"]
    assert all(
        any(
            place["country_code"] == code and place["area"] is None for place in RECORDS
        )
        for code in labels
    )


def test_backend_places_and_featured_set_match_catalog() -> None:
    """The API sees exactly the records in the shared JSON file."""
    assert PLACES == tuple(_tuple(place) for place in RECORDS)
    assert FEATURED_PLACES == frozenset(
        _tuple(place) for place in RECORDS if place.get("featured")
    )


def test_featured_places_cover_each_demo_region() -> None:
    """Quick picks remain available for the featured development fixtures."""
    featured_codes = {_tuple(place)[2] for place in RECORDS if place.get("featured")}
    assert {"FR", "MA", "GB"} <= featured_codes
    assert any(_tuple(place)[1] for place in RECORDS if place.get("featured"))


def test_places_file_is_packaged_with_the_repository() -> None:
    """The data file is packaged with the backend image, not user-generated."""
    root_file = Path(__file__).resolve().parents[1] / "data" / "places.json"
    assert root_file == PLACES_FILE
