import io
from random import Random

from PIL import Image, ImageDraw


def seed_photo(rng: Random, index: int) -> bytes:
    """Generate a numbered avatar for a demo profile.

    Args:
        rng (Random): Color generator.
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
