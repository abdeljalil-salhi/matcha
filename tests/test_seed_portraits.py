import io

from PIL import Image

from server.jobs.seed_identity import seed_identity
from server.jobs.seed_photo import portrait_catalog, portrait_jpeg, seed_portrait


def test_bundled_portraits_are_adult_jpegs() -> None:
    """Verify every offline fixture is an adult portrait served as valid JPEG.

    Args:
        None.

    Returns:
        None.
    """
    catalog = portrait_catalog()
    assert len({item["id"] for item in catalog}) == 219
    for item in catalog:
        assert item["age"] >= 18
        with Image.open(io.BytesIO(portrait_jpeg(item["id"]))) as image:
            assert image.format == "JPEG"
            assert image.mode == "RGB"
            assert image.size == (256, 256)
            image.verify()


def test_seed_identities_and_portraits_are_stable() -> None:
    """Verify deterministic names, natural biographies, and adult selection.

    Args:
        None.

    Returns:
        None.
    """
    for gender in ("woman", "man", "nonbinary", "other"):
        for age in (20, 35, 65):
            assert seed_portrait(42, gender, age) == seed_portrait(42, gender, age)
        identities = [seed_identity(i, gender, ["art", "books"]) for i in range(1, 501)]
        assert len({(x["first_name"], x["last_name"]) for x in identities}) == 500
        assert all("Fictional demo profile" not in x["bio"] for x in identities)
        assert seed_identity(42, gender, ["art", "books"]) == identities[41]
