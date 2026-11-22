import io
import json
from functools import lru_cache
from pathlib import Path
from random import Random
from typing import cast

from PIL import Image, ImageDraw

from .types import SeedPortrait

PORTRAITS_PATH = Path(__file__).parent / "assets" / "portraits"
JPEG_QUALITY = 85
PORTRAIT_AGE_TOLERANCE = 8


@lru_cache(maxsize=1)
def portrait_catalog() -> list[SeedPortrait]:
    """Load trusted adult portrait fixture metadata from the bundled index.

    Args:
        None.

    Returns:
        list[SeedPortrait]: Source IDs, ages, and presentation categories.
    """
    return cast(
        list[SeedPortrait], json.loads((PORTRAITS_PATH / "index.json").read_text())
    )


@lru_cache(maxsize=256)
def portrait_jpeg(portrait_id: str) -> bytes:
    """Encode one bundled WebP portrait for the existing JPEG photo endpoint.

    Args:
        portrait_id (str): Trusted source identifier from the fixture index.

    Returns:
        bytes: RGB JPEG image without source metadata.
    """
    with Image.open(PORTRAITS_PATH / f"{portrait_id}.webp") as image:
        output = io.BytesIO()
        image.convert("RGB").save(output, "JPEG", quality=JPEG_QUALITY)
        return output.getvalue()


def seed_portrait(number: int, gender: str, age: int) -> bytes:
    """Select a stable synthetic adult portrait near the fixture's age.

    Args:
        number (int): One-based demo account number.
        gender (str): Seeded gender used to select source presentation metadata.
        age (int): Seeded adult age in years.

    Returns:
        bytes: Selected portrait as JPEG; some demo accounts share a portrait.
    """
    category = {"woman": "w", "man": "m", "nonbinary": "x"}.get(gender)
    candidates = [
        item
        for item in portrait_catalog()
        if not category or item["gender"] == category
    ]
    nearest = min(abs(item["age"] - age) for item in candidates)
    candidates = [
        item
        for item in candidates
        if abs(item["age"] - age) <= max(nearest, PORTRAIT_AGE_TOLERANCE)
    ]
    return portrait_jpeg(candidates[(number - 1) % len(candidates)]["id"])


def legacy_seed_photo(rng: Random, index: int) -> bytes:
    """Reproduce an old avatar to recognize unchanged legacy fixtures.

    Args:
        rng (Random): Original seed generator; preserves its random sequence.
        index (int): Profile number.

    Returns:
        bytes: JPEG avatar.
    """
    color = tuple(rng.randrange(35, 206) for _ in range(3))
    image = Image.new("RGB", (160, 160), color=color)
    painter = ImageDraw.Draw(image)
    painter.ellipse((58, 30, 102, 74), fill="#f4ebde")
    painter.rounded_rectangle((37, 79, 123, 139), radius=20, fill="#f4ebde")
    painter.text((5, 145), f"Demo {index:03}", fill="white")
    output = io.BytesIO()
    image.save(output, "JPEG", quality=82)
    return output.getvalue()
