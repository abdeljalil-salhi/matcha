import re
from http import HTTPStatus

from flask import Flask
from psycopg import Connection


def test_openapi_matches_the_api(backend: tuple[Flask, Connection]) -> None:
    """Check that Swagger UI serves a contract for every API operation.

    Args:
        backend (tuple[Flask, Connection]): Test app and database connection.

    Returns:
        None.
    """
    app, _ = backend
    client = app.test_client()
    docs = client.get("/docs")
    assert docs.status_code == HTTPStatus.OK
    assert "script-src 'self'" in docs.headers["Content-Security-Policy"]
    assert client.get("/docs/assets/swagger-ui-bundle.js").status_code == HTTPStatus.OK
    assert client.get("/docs/assets/swagger-init.js").status_code == HTTPStatus.OK

    response = client.get("/openapi.json")
    assert response.status_code == HTTPStatus.OK
    spec = response.json
    documented = {
        (path, method.upper())
        for path, operations in spec["paths"].items()
        for method in operations
    }
    registered = {
        (
            re.sub(r"<(?:[^:]+:)?([^>]+)>", r"{\1}", rule.rule.removeprefix("/api")),
            method,
        )
        for rule in app.url_map.iter_rules()
        if rule.rule.startswith("/api/")
        for method in rule.methods - {"HEAD", "OPTIONS"}
    }
    assert documented == registered
    assert (
        "script-src" not in client.get("/api/health").headers["Content-Security-Policy"]
    )


def test_api_browser_origins(backend: tuple[Flask, Connection]) -> None:
    """Check that docs can submit same-origin requests under the origin policy.

    Args:
        backend (tuple[Flask, Connection]): Test app and database connection.

    Returns:
        None.
    """
    app, _ = backend
    client = app.test_client()
    for origin, status in (
        ("http://localhost", HTTPStatus.UNPROCESSABLE_ENTITY),
        (app.config["FRONTEND_URL"], HTTPStatus.UNPROCESSABLE_ENTITY),
        ("https://untrusted.example", HTTPStatus.FORBIDDEN),
    ):
        response = client.post("/api/auth/login", json={}, headers={"Origin": origin})
        assert response.status_code == status
