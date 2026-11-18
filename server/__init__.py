from collections.abc import Mapping

from flask import Flask
from psycopg_pool import ConnectionPool

from .common.config import settings
from .common.db import pool_options, release_db
from .common.hooks import register_http_hooks
from .common.limits import MIN_SIGNING_SECRET_LENGTH

DB_POOL_MIN_SIZE = 1
DB_POOL_MAX_SIZE = 8
DB_POOL_WAIT_SECONDS = 4


def create_app(overrides: Mapping[str, object] | None = None) -> Flask:
    """Build the Flask application and register routes and hooks.

    Args:
        overrides (Mapping[str, object] | None): Test config, or None to load the env.

    Returns:
        Flask: Configured application.
    """
    from .auth.routes.email_change import routes as email_change
    from .auth.routes.recovery import routes as recovery
    from .auth.routes.registration import routes as registration
    from .auth.routes.sessions import routes as sessions
    from .chat.conversations import routes as conversations
    from .chat.routes import routes as chat
    from .docs.routes import routes as docs
    from .notifications.routes import routes as notifications
    from .profiles.routes.discovery import routes as discovery
    from .location.routes import routes as location
    from .profiles.routes.photos import routes as photos
    from .profiles.routes.profiles import routes as profiles
    from .profiles.routes.tags import routes as tags
    from .relationships.routes.likes import routes as likes
    from .relationships.routes.moderation import routes as moderation
    from .relationships.routes.visits import routes as visits

    app = Flask(__name__)
    app.config.update(settings() if overrides is None else overrides)
    if len(app.config["MATCHA_SECRET"]) < MIN_SIGNING_SECRET_LENGTH:
        raise RuntimeError(
            "MATCHA_SECRET must contain at least "
            f"{MIN_SIGNING_SECRET_LENGTH} characters."
        )
    app.extensions["db"] = ConnectionPool(
        app.config["DATABASE_URL"],
        min_size=DB_POOL_MIN_SIZE,
        max_size=DB_POOL_MAX_SIZE,
        timeout=DB_POOL_WAIT_SECONDS,
        open=True,
        kwargs=app.config.get("DB_CONNECTION_OPTIONS", pool_options()),
    )
    app.teardown_appcontext(release_db)
    for blueprint in (
        email_change,
        recovery,
        registration,
        sessions,
        conversations,
        chat,
        notifications,
        discovery,
        location,
        photos,
        profiles,
        tags,
        likes,
        moderation,
        visits,
    ):
        app.register_blueprint(blueprint, url_prefix="/api")

    app.register_blueprint(docs)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        """Check that the database schema is reachable.

        Returns:
            dict[str, str]: API health status.
        """
        with app.extensions["db"].connection() as connection:
            connection.execute("SELECT 1 FROM users LIMIT 1")
        return {"status": "ok"}

    register_http_hooks(app)
    return app
