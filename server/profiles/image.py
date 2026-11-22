import io
import warnings
from http import HTTPStatus
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError

from ..common.http import ApiError
from .limits import MAX_PHOTO_BYTES

MAX_PHOTO_EDGE_PIXELS = 1600
PHOTO_JPEG_QUALITY = 85


MAX_PHOTO_PIXELS = 16_000_000


def image_bytes(source: BinaryIO) -> bytes:
    """Validate and convert an uploaded still image to a resized JPEG.

    Args:
        source (BinaryIO): Uploaded image stream.

    Returns:
        bytes: Re-encoded JPEG without source metadata.
    """
    raw = source.read(MAX_PHOTO_BYTES + 1)
    if len(raw) > MAX_PHOTO_BYTES:
        raise ApiError(
            HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Photos must be 10 MiB or smaller."
        )
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw), formats=("JPEG", "PNG", "WEBP")) as image:
                if image.width * image.height > MAX_PHOTO_PIXELS or getattr(
                    image, "is_animated", False
                ):
                    raise ApiError(
                        HTTPStatus.UNPROCESSABLE_ENTITY,
                        "Choose a still image of at most 16 megapixels.",
                    )
                picture = ImageOps.exif_transpose(image).convert("RGB")
                picture.thumbnail((MAX_PHOTO_EDGE_PIXELS, MAX_PHOTO_EDGE_PIXELS))
                output = io.BytesIO()
                picture.save(output, "JPEG", quality=PHOTO_JPEG_QUALITY)
                return output.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Upload a valid JPEG, PNG or WebP image."
        ) from None
