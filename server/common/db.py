from typing import Any

from flask import current_app, g
from psycopg import Connection
from psycopg.rows import dict_row

DB_CONNECT_TIMEOUT_SECONDS = 4
DB_STATEMENT_TIMEOUT_MS = 4500
DB_LOCK_TIMEOUT_MS = 3000


def db() -> Connection:
    """Borrow a pooled connection and reuse it for the current request.

    Returns:
        Connection: Psycopg connection with dictionary rows.
    """
    if "connection" not in g:
        g.connection = current_app.extensions["db"].getconn()
    return g.connection


def release_db(_error: BaseException | None) -> None:
    """Return the current request's connection to the pool.

    Args:
        _error (BaseException | None): Teardown error supplied by Flask.

    Returns:
        None.
    """
    connection = g.pop("connection", None)
    if connection is not None:
        current_app.extensions["db"].putconn(connection)


def lock_users(*ids: int) -> list[dict]:
    """Lock user rows in ascending ID order within the current transaction.

    Args:
        *ids (int): User IDs to lock.

    Returns:
        list[dict]: Existing user rows, ordered by ID.
    """
    return (
        db()
        .execute(
            "SELECT * FROM users WHERE id = ANY(%s) ORDER BY id FOR NO KEY UPDATE",
            (sorted(set(ids)),),
        )
        .fetchall()
    )


def pool_options() -> dict[str, Any]:
    """Provide common options for opening PostgreSQL connections.

    Returns:
        dict[str, Any]: Row factory, timeouts, and transaction settings.
    """
    return {
        "row_factory": dict_row,
        "connect_timeout": DB_CONNECT_TIMEOUT_SECONDS,
        "autocommit": True,
        "options": (
            f"-c statement_timeout={DB_STATEMENT_TIMEOUT_MS} "
            f"-c lock_timeout={DB_LOCK_TIMEOUT_MS}"
        ),
    }
