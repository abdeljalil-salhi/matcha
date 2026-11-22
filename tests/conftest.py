import os
from collections.abc import Iterator
from uuid import uuid4

import psycopg
import pytest
from flask import Flask
from server import create_app
from server.common.db import pool_options
from server.common.config import (
    MAX_FORM_MEMORY_BYTES,
    MAX_MULTIPART_PARTS,
    MULTIPART_OVERHEAD_BYTES,
)
from server.profiles.limits import MAX_PHOTO_BYTES
from server.jobs.migrations import migrate
from psycopg import Connection

from .helpers import ORIGIN, SECRET


@pytest.fixture
def backend() -> Iterator[tuple[Flask, Connection]]:
    """Set up and tear down an isolated PostgreSQL schema for the API tests.

    Yields:
        tuple[Flask, Connection]: Test app and database connection.
    """
    dsn = os.environ.get("MATCHA_TEST_DSN")
    if not dsn:
        pytest.skip("Set MATCHA_TEST_DSN to a disposable PostgreSQL database.")
    schema = f"matcha_test_{uuid4().hex}"
    options = pool_options()
    options["options"] += f" -c search_path={schema}"
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(f'CREATE SCHEMA "{schema}"')
        connection = psycopg.connect(dsn, **options)
        app = None
        try:
            migrate(connection)
            migrate(connection)
            app = create_app(
                {
                    "TESTING": True,
                    "DATABASE_URL": dsn,
                    "MATCHA_SECRET": SECRET,
                    "DB_CONNECTION_OPTIONS": options,
                    "FRONTEND_URL": ORIGIN,
                    "COOKIE_SECURE": False,
                    "RATELIMIT": False,
                    "MAX_CONTENT_LENGTH": MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES,
                    "MAX_FORM_MEMORY_SIZE": MAX_FORM_MEMORY_BYTES,
                    "MAX_FORM_PARTS": MAX_MULTIPART_PARTS,
                }
            )
            yield app, connection
        finally:
            if app:
                app.extensions["db"].close()
            connection.close()
            admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
