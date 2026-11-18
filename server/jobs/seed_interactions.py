from collections.abc import Mapping, Sequence
from random import Random

from psycopg import Connection


def seed_interactions(
    connection: Connection,
    rng: Random,
    seeded: Sequence[Mapping[str, int]],
    user_ids: list[int],
) -> None:
    """Create sample visits and likes without generating notifications.

    Args:
        connection (Connection): Psycopg connection.
        rng (Random): Sampler.
        seeded (Sequence[Mapping[str, int]]): Demo IDs.
        user_ids (list[int]): New profile IDs.

    Returns:
        None.
    """
    evaluator_ids = {row["id"] for row in seeded[:2]}
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO visits (viewer_id, target_id) VALUES (%s, %s) ON CONFLICT DO "
            "NOTHING",
            [
                (source["id"], target)
                for target in user_ids
                for source in rng.sample(seeded, rng.randrange(0, 31))
                if source["id"] != target
            ],
        )
        cursor.executemany(
            "INSERT INTO likes (actor_id, target_id) VALUES (%s, %s) ON CONFLICT DO "
            "NOTHING",
            [
                (source["id"], target)
                for target in user_ids
                for source in rng.sample(seeded, rng.randrange(0, 17))
                if source["id"] != target
                and not (target in evaluator_ids and source["id"] in evaluator_ids)
            ],
        )
