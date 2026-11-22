from psycopg import Connection

from .types import SeedIdentity

LEGACY_BIO_SUFFIX = " Fictional demo profile with an AI-generated portrait."


def refresh_demo(
    connection: Connection,
    user_id: int,
    number: int,
    identity: SeedIdentity,
    old_bio: str,
    old_photo: bytes,
    photo: bytes,
) -> None:
    """Upgrade unchanged placeholder fields while preserving demo account edits.

    Args:
        connection (Connection): Active seed transaction.
        user_id (int): Confirmed demo account identifier.
        number (int): Original one-based fixture number.
        identity (SeedIdentity): New fictional display identity.
        old_bio (str): Exact legacy biography expected for this account.
        old_photo (bytes): Exact legacy avatar expected for this account.
        photo (bytes): New synthetic portrait encoded as JPEG.

    Returns:
        None.
    """
    connection.execute(
        "UPDATE users SET first_name = CASE WHEN first_name = 'Demo' THEN %s "
        "ELSE first_name END, last_name = CASE WHEN last_name = %s THEN %s "
        "ELSE last_name END, bio = CASE WHEN bio IN (%s, %s) THEN %s ELSE bio END "
        "WHERE id = %s AND is_demo",
        (
            identity["first_name"],
            f"Profile {number:03}",
            identity["last_name"],
            old_bio,
            identity["bio"] + LEGACY_BIO_SUFFIX,
            identity["bio"],
            user_id,
        ),
    )
    connection.execute(
        "UPDATE photos SET content = %s WHERE user_id = %s AND slot = 1 "
        "AND content = %s",
        (photo, user_id, old_photo),
    )
