import logging
import random
from datetime import date

from psycopg import Connection

from ..auth.passwords import hasher
from ..auth.validation import password
from ..location.places import PLACES
from .seed_interactions import seed_interactions
from .seed_photo import seed_photo
from ..location.limits import LOCATION_DECIMAL_PLACES

LOG = logging.getLogger(__name__)


DEMO_PROFILE_COUNT = 500
SEED_RANDOM_STATE = 238541
SEED_ADVISORY_LOCK = 408302
SEED_STATEMENT_TIMEOUT = "30s"

TAGS = (
    "art",
    "books",
    "climbing",
    "cooking",
    "cycling",
    "film",
    "gaming",
    "gardening",
    "hiking",
    "jazz",
    "photography",
    "running",
    "travel",
    "vegan",
    "yoga",
)


def seed(connection: Connection, phrase: str | None) -> None:
    """Populate demo profiles and optionally enable the evaluator accounts.

    Args:
        connection (Connection): Psycopg connection.
        phrase (str | None): Password for evaluator accounts.

    Returns:
        None.
    """
    hashed = hasher.hash(password(phrase)) if phrase else None
    rng = random.Random(SEED_RANDOM_STATE)
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(%s)", (SEED_ADVISORY_LOCK,))
        connection.execute(
            "SELECT set_config('statement_timeout', %s, true)",
            (SEED_STATEMENT_TIMEOUT,),
        )
        connection.execute(
            "INSERT INTO tags SELECT unnest(%s::text[]) ON CONFLICT DO NOTHING",
            (list(TAGS),),
        )
        user_ids = []
        genders = ("woman", "man", "nonbinary", "other")
        for number in range(1, DEMO_PROFILE_COUNT + 1):
            gender = rng.choices(genders, weights=(44, 44, 9, 3))[0]
            seeks = rng.choice(
                [None, ["woman"], ["man"], ["woman", "man"], list(genders)]
            )
            city, area, country, lat, lon = rng.choice(PLACES)
            selected_tags = rng.sample(TAGS, rng.randrange(2, 7))
            birthday = date(
                date.today().year - rng.randrange(20, 67),
                rng.randrange(1, 13),
                rng.randrange(1, 29),
            )
            photo = seed_photo(rng, number)
            name = f"demo_{number:03}"
            # Reserve shared sign-in for two clearly marked evaluator accounts.
            hash_value = hashed if hashed and number in (1, 2) else "!"
            user = connection.execute(
                """INSERT INTO users (
                       username, email, first_name, last_name, password_hash,
                           verified_at,
                       birth_date, gender, seeks, bio, city, area, country_code,
                           latitude, longitude,
                       location_source, location_set_at, is_demo
                   ) VALUES (%s, %s, %s, %s, %s, now(), %s, %s, %s, %s, %s, %s, %s, %s,
                       %s, 'manual', now(), true)
                   ON CONFLICT DO NOTHING RETURNING id""",
                (
                    name,
                    f"{name}@seed.example.test",
                    "Demo",
                    f"Profile {number:03}",
                    hash_value,
                    birthday,
                    gender,
                    seeks,
                    f"Demo profile {number}. "
                    f"Interests include {', '.join(selected_tags)}.",
                    city,
                    area,
                    country,
                    round(lat, LOCATION_DECIMAL_PLACES),
                    round(lon, LOCATION_DECIMAL_PLACES),
                ),
            ).fetchone()
            if not user:
                user = connection.execute(
                    "SELECT id, is_demo FROM users WHERE username = %s", (name,)
                ).fetchone()
                if not user or not user["is_demo"]:
                    raise RuntimeError(
                        "Demo username or email already belongs "
                        f"to another account: {name}"
                    )
                # A seed rerun may enable or disable evaluator sign-in explicitly.
                if number in (1, 2):
                    connection.execute(
                        "UPDATE users SET password_hash = %s WHERE id = %s",
                        (hash_value, user["id"]),
                    )
                    connection.execute(
                        "DELETE FROM sessions WHERE user_id = %s", (user["id"],)
                    )
            else:
                connection.execute(
                    "INSERT INTO user_tags SELECT %s, unnest(%s::text[])",
                    (user["id"], selected_tags),
                )
                connection.execute(
                    "INSERT INTO photos (user_id, slot, is_primary, content) VALUES "
                    "(%s, 1, true, %s)",
                    (user["id"], photo),
                )
                user_ids.append(user["id"])
        # Vary fame scores without creating notifications.
        seeded = connection.execute(
            "SELECT id FROM users WHERE is_demo ORDER BY username"
        ).fetchall()
        if user_ids:
            seed_interactions(connection, rng, seeded, user_ids)
    LOG.info("Demo profiles available: %s", len(seeded))
