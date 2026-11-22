"""Remove expired state and preserve last-seen timestamps."""

from psycopg import Connection

from .limits import RATE_WINDOW_RETENTION_DAYS


def clean(connection: Connection) -> None:
    """Remove expired state and retain the last activity of expired sessions.

    Args:
        connection (Connection): Psycopg connection used by the worker.

    Returns:
        None.
    """
    connection.execute(
        "DELETE FROM rate_windows WHERE window_start < now() - %s * interval '1 day'",
        (RATE_WINDOW_RETENTION_DAYS,),
    )
    connection.execute("DELETE FROM account_links WHERE expires_at <= now()")
    connection.execute("DELETE FROM geocoder_cache WHERE expires_at <= now()")
    connection.execute("""WITH locked AS MATERIALIZED (
               SELECT u.id FROM users u
               WHERE EXISTS (SELECT 1 FROM sessions WHERE user_id = u.id AND expires_at
                   <= now())
               ORDER BY u.id FOR NO KEY UPDATE
           ), expired AS (
               DELETE FROM sessions s USING locked
               WHERE s.user_id = locked.id AND s.expires_at <= now()
               RETURNING user_id, last_seen
           ), seen AS (SELECT user_id, max(last_seen) AS last_seen FROM expired GROUP BY
               user_id)
           UPDATE users u SET last_seen = greatest(u.last_seen, seen.last_seen)
           FROM seen WHERE u.id = seen.user_id""")
