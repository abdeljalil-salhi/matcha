import logging
from pathlib import Path

from psycopg import Connection

LOG = logging.getLogger(__name__)
SCHEMA = Path(__file__).resolve().parents[2] / "sql"


MIGRATION_ADVISORY_LOCK = 408301


def migrate(connection: Connection) -> None:
    """Apply and record pending SQL migrations in filename order.

    Args:
        connection (Connection): Psycopg connection with dictionary rows.

    Returns:
        None.
    """
    with connection.transaction():
        connection.execute(
            "SELECT pg_advisory_xact_lock(%s)", (MIGRATION_ADVISORY_LOCK,)
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, "
            "applied_at timestamptz DEFAULT now())"
        )
        applied = {
            row["name"]
            for row in connection.execute("SELECT name FROM schema_migrations")
        }
        for file in sorted(SCHEMA.glob("*.sql")):
            if file.name not in applied:
                connection.execute(file.read_text(), prepare=False)
                connection.execute(
                    "INSERT INTO schema_migrations (name) VALUES (%s)", (file.name,)
                )
                LOG.info("Applied %s", file.name)
