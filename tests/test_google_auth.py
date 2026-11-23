from http import HTTPStatus
from urllib.parse import parse_qs, quote, urlsplit

from flask import Flask
from psycopg import Connection
from pytest import MonkeyPatch, raises

from server.auth.google import GoogleProfile, UpstreamError, read_profile

from .helpers import ORIGIN, create_user, register

GOOGLE_CONFIG = {
    "GOOGLE_CLIENT_ID": "matcha-test.apps.googleusercontent.com",
    "GOOGLE_CLIENT_SECRET": "google-test-secret",
    "GOOGLE_REDIRECT_URI": "http://localhost:8000/api/auth/google/callback",
}
FLOW_COOKIE = "matcha_google_flow"
SESSION_COOKIE = "matcha_session"


def configure(app: Flask) -> None:
    """Enable the optional strategy in the test app.

    Args:
        app (Flask): Test application.

    Returns:
        None.
    """
    app.config.update(GOOGLE_CONFIG)


def claims(**overrides: object) -> GoogleProfile:
    """Build a verified Google profile for the test double.

    Args:
        **overrides (object): Fields to replace.

    Returns:
        GoogleProfile: Test identity.
    """
    values = {
        "subject": "google-123",
        "email": "ada.lovelace@example.test",
        "first_name": "Ada",
        "last_name": "Lovelace",
    }
    values.update(overrides)
    return GoogleProfile(**values)


def mock_provider(monkeypatch: MonkeyPatch, profile: GoogleProfile) -> list[str]:
    """Replace the two upstream Google calls with local doubles.

    Args:
        monkeypatch (MonkeyPatch): Pytest patch fixture.
        profile (GoogleProfile): Profile returned by userinfo.

    Returns:
        list[str]: PKCE verifiers seen by the token exchange.
    """
    seen: list[str] = []

    def exchange(code: str, verifier: str) -> str:
        assert code == "valid-code"
        seen.append(verifier)
        return "google-access-token"

    def fetch(token: str) -> GoogleProfile:
        assert token == "google-access-token"
        return profile

    monkeypatch.setattr("server.auth.routes.google.google.exchange_code", exchange)
    monkeypatch.setattr("server.auth.routes.google.google.fetch_profile", fetch)
    return seen


def begin(client, next_path: str | None = None):
    """Open the Google flow and return its state and signed cookie.

    Args:
        client: Flask test client.
        next_path (str | None): Requested post-sign-in destination.

    Returns:
        tuple[str, str]: State parameter and flow cookie value.
    """
    path = "/api/auth/google/start"
    if next_path:
        path += f"?next={quote(next_path, safe='')}"
    response = client.get(path)
    assert response.status_code == HTTPStatus.FOUND
    location = urlsplit(response.headers["Location"])
    assert location.hostname == "accounts.google.com"
    query = parse_qs(location.query)
    assert query["client_id"] == [GOOGLE_CONFIG["GOOGLE_CLIENT_ID"]]
    assert query["redirect_uri"] == [GOOGLE_CONFIG["GOOGLE_REDIRECT_URI"]]
    assert query["code_challenge_method"] == ["S256"]
    assert query["response_type"] == ["code"]
    assert query["scope"] == ["openid email profile"]
    assert len(query["state"][0]) >= 32
    assert len(query["code_challenge"][0]) >= 43
    cookie = client.get_cookie(FLOW_COOKIE, path="/api/auth/google")
    assert cookie is not None
    assert "HttpOnly" in response.headers["Set-Cookie"]
    assert "SameSite=Lax" in response.headers["Set-Cookie"]
    return query["state"][0], cookie.value


def finish(client, state: str, **extra: str):
    """Return from Google with an authorization code.

    Args:
        client: Flask test client.
        state (str): State from the authorization URL.
        **extra (str): Additional query parameters.

    Returns:
        TestResponse: Callback redirect.
    """
    return client.get(
        "/api/auth/google/callback",
        query_string={"code": "valid-code", "state": state, **extra},
    )


def test_status_and_start_require_configuration(
    backend: tuple[Flask, Connection],
) -> None:
    """The button stays hidden and the flow unavailable without credentials."""
    app, _ = backend
    client = app.test_client()
    assert client.get("/api/auth/google/status").json == {"enabled": False}
    disabled = client.get("/api/auth/google/start")
    assert disabled.status_code == HTTPStatus.FOUND
    assert "/login?google=unavailable" in disabled.headers["Location"]
    assert client.get_cookie(FLOW_COOKIE) is None

    configure(app)
    assert client.get("/api/auth/google/status").json == {"enabled": True}


def test_google_signin_creates_verified_account_and_session(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """A new Google identity gets a verified account and a session cookie."""
    app, connection = backend
    configure(app)
    seen = mock_provider(monkeypatch, claims())
    client = app.test_client()
    state, _ = begin(client, "/onboarding")
    response = finish(client, state)
    assert response.status_code == HTTPStatus.FOUND
    assert response.headers["Location"] == f"{ORIGIN}/onboarding"
    assert len(seen) == 1 and len(seen[0]) >= 64

    user = connection.execute(
        "SELECT username, email, first_name, last_name, password_hash, verified_at "
        "FROM users"
    ).fetchone()
    assert user["username"] == "ada_lovelace"
    assert user["email"] == "ada.lovelace@example.test"
    assert user["first_name"] == "Ada" and user["last_name"] == "Lovelace"
    assert user["password_hash"] == "!" and user["verified_at"] is not None
    link = connection.execute(
        "SELECT provider_user_id, user_id FROM oauth_accounts"
    ).fetchone()
    assert link["provider_user_id"] == "google-123"
    session = client.get_cookie(SESSION_COOKIE)
    assert session is not None
    assert "HttpOnly" in response.headers["Set-Cookie"]
    assert "SameSite=Lax" in response.headers["Set-Cookie"]
    assert client.get_cookie(FLOW_COOKIE) is None
    me = client.get("/api/me")
    assert me.status_code == HTTPStatus.OK
    assert me.json["complete"] is False


def test_google_signin_links_existing_email_without_changing_password(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """An existing verified account is reused and keeps its password."""
    app, connection = backend
    configure(app)
    client, user_id = create_user(app, connection, "verified", monkeypatch)
    original = connection.execute(
        "SELECT password_hash FROM users WHERE id = %s", (user_id,)
    ).fetchone()["password_hash"]
    mock_provider(monkeypatch, claims(email="verified@example.test"))
    state, _ = begin(client)
    response = finish(client, state)
    assert response.status_code == HTTPStatus.FOUND
    assert response.headers["Location"] == f"{ORIGIN}/discover"
    assert (
        connection.execute("SELECT count(*) AS total FROM users").fetchone()["total"]
        == 1
    )
    assert (
        connection.execute(
            "SELECT password_hash FROM users WHERE id = %s", (user_id,)
        ).fetchone()["password_hash"]
        == original
    )
    link = connection.execute("SELECT user_id FROM oauth_accounts").fetchone()
    assert link["user_id"] == user_id


def test_google_signin_waits_for_local_email_verification(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """An unverified password account cannot be claimed through Google."""
    app, connection = backend
    configure(app)
    client = app.test_client()
    assert register(client, "pending").status_code == HTTPStatus.CREATED
    mock_provider(monkeypatch, claims(email="pending@example.test"))
    state, _ = begin(client)
    response = finish(client, state)
    assert response.status_code == HTTPStatus.FOUND
    assert "/login?google=pending" in response.headers["Location"]
    assert client.get_cookie(SESSION_COOKIE) is None
    assert (
        connection.execute("SELECT count(*) AS total FROM oauth_accounts").fetchone()[
            "total"
        ]
        == 0
    )


def test_google_callback_rejects_mismatched_or_replayed_state(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """State, cookie, and one-use semantics are all enforced."""
    app, connection = backend
    configure(app)
    mock_provider(monkeypatch, claims())
    client = app.test_client()
    state, _ = begin(client)
    wrong = finish(client, state + "x")
    assert "/login?google=invalid" in wrong.headers["Location"]
    assert client.get_cookie(SESSION_COOKIE) is None
    assert (
        connection.execute("SELECT count(*) AS total FROM users").fetchone()["total"]
        == 0
    )

    state, _ = begin(client)
    first = finish(client, state)
    assert first.headers["Location"] == f"{ORIGIN}/discover"
    replay = finish(client, state)
    assert "/login?google=invalid" in replay.headers["Location"]
    assert (
        connection.execute("SELECT count(*) AS total FROM sessions").fetchone()["total"]
        == 1
    )


def test_google_failures_return_to_login(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """Declines, unverified claims, and upstream errors show distinct reasons."""
    app, _ = backend
    configure(app)
    client = app.test_client()

    state, _ = begin(client)
    denied = client.get(
        "/api/auth/google/callback",
        query_string={"error": "access_denied", "state": state},
    )
    assert "/login?google=denied" in denied.headers["Location"]

    monkeypatch.setattr(
        "server.auth.routes.google.google.exchange_code",
        lambda _code, _verifier: "google-access-token",
    )

    def invalid_profile(_token: str) -> GoogleProfile:
        raise ValueError("Google did not return a verified identity.")

    monkeypatch.setattr(
        "server.auth.routes.google.google.fetch_profile", invalid_profile
    )
    state, _ = begin(client)
    unverified = finish(client, state)
    assert "/login?google=invalid" in unverified.headers["Location"]

    def fail(_code: str, _verifier: str) -> str:
        raise UpstreamError

    monkeypatch.setattr("server.auth.routes.google.google.exchange_code", fail)
    state, _ = begin(client)
    unavailable = finish(client, state)
    assert "/login?google=unavailable" in unavailable.headers["Location"]


def test_read_profile_requires_verified_google_email() -> None:
    """Unverified claims never become a Matcha identity."""
    with raises(ValueError):
        read_profile(
            {"sub": "123", "email": "ada@example.test", "email_verified": False}
        )
    with raises(ValueError):
        read_profile({"sub": "", "email": "ada@example.test", "email_verified": True})
    profile = read_profile(
        {
            "sub": "123",
            "email": "Ada.Lovelace@Example.test",
            "email_verified": True,
            "given_name": "Ada",
            "family_name": "Lovelace",
        }
    )
    assert profile.email == "ada.lovelace@example.test"
    assert profile.first_name == "Ada" and profile.last_name == "Lovelace"


def test_google_identity_is_stable_when_email_changes(
    backend: tuple[Flask, Connection], monkeypatch: MonkeyPatch
) -> None:
    """A Google subject always maps back to the same Matcha account."""
    app, connection = backend
    configure(app)
    mock_provider(monkeypatch, claims(email="first@example.test"))
    client = app.test_client()
    state, _ = begin(client)
    assert finish(client, state).status_code == HTTPStatus.FOUND
    first_id = connection.execute("SELECT id FROM users").fetchone()["id"]

    mock_provider(monkeypatch, claims(email="second@example.test"))
    state, _ = begin(client)
    assert finish(client, state).status_code == HTTPStatus.FOUND
    assert (
        connection.execute("SELECT count(*) AS total FROM users").fetchone()["total"]
        == 1
    )
    assert (
        connection.execute("SELECT user_id FROM oauth_accounts").fetchone()["user_id"]
        == first_id
    )
    assert (
        connection.execute(
            "SELECT email FROM users WHERE id = %s", (first_id,)
        ).fetchone()["email"]
        == "first@example.test"
    )
