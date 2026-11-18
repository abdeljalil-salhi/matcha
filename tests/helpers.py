from email.message import EmailMessage
from http import HTTPStatus

from flask import Flask
from flask.testing import FlaskClient
from server.jobs.mail import send_one
from psycopg import Connection
from pytest import MonkeyPatch
from werkzeug.test import TestResponse

ORIGIN = "http://localhost:5173"
PASSWORD = "Scenic!quartz?41-lamplight"
SECRET = "integration-test-secret-with-at-least-32-characters"


def register(client: FlaskClient, name: str, phrase: str = PASSWORD) -> TestResponse:
    """Submit a registration request for a test account.

    Args:
        client (FlaskClient): API client.
        name (str): Test username.
        phrase (str): Candidate password.

    Returns:
        TestResponse: Registration response.
    """
    return client.post(
        "/api/auth/register",
        json={
            "username": name,
            "email": f"{name}@example.test",
            "first_name": "Taylor",
            "last_name": "Sample",
            "password": phrase,
        },
    )


def login(client: FlaskClient, name: str, phrase: str = PASSWORD) -> TestResponse:
    """Submit credentials for a test account.

    Args:
        client (FlaskClient): API client.
        name (str): Test username.
        phrase (str): Candidate password.

    Returns:
        TestResponse: Login response.
    """
    return client.post("/api/auth/login", json={"username": name, "password": phrase})


def take_mail(connection: Connection, monkeypatch: MonkeyPatch) -> EmailMessage:
    """Run one outbox item through a test SMTP transport.

    Args:
        connection (Connection): Test database connection.
        monkeypatch (MonkeyPatch): Fixture used to replace SMTP.

    Returns:
        EmailMessage: Captured outbound email.
    """

    class SMTP:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            """Accept constructor arguments passed to the SMTP test double.

            Args:
                *_args (object): Positional inputs.
                **_kwargs (object): Named inputs.

            Returns:
                None.
            """
            pass

        def __enter__(self) -> "SMTP":
            """Provide the test transport to the SMTP context manager.

            Returns:
                SMTP: The current test transport.
            """
            return self

        def __exit__(self, *_error: object) -> None:
            """Leave the SMTP context without suppressing errors.

            Args:
                *_error (object): Context-exit exception details, if any.

            Returns:
                None.
            """
            pass

        def send_message(self, message: EmailMessage) -> None:
            """Capture an email for test assertions.

            Args:
                message (EmailMessage): Outbound email.

            Returns:
                None.
            """
            received.append(message)

    received = []
    monkeypatch.setenv("SMTP_MODE", "plain")
    monkeypatch.setenv("SMTP_HOST", "test-smtp")
    monkeypatch.setenv("SMTP_FROM", "matcha@example.test")
    monkeypatch.setattr("server.jobs.mail.smtplib.SMTP", SMTP)
    assert send_one(connection, {"FRONTEND_URL": ORIGIN, "MATCHA_SECRET": SECRET})
    assert len(received) == 1
    return received[0]


def create_user(
    app: Flask, connection: Connection, name: str, monkeypatch: MonkeyPatch
) -> tuple[FlaskClient, int]:
    """Register, verify, and log in to a test account.

    Args:
        app (Flask): Test app.
        connection (Connection): Test database.
        name (str): Username.
        monkeypatch (MonkeyPatch): SMTP fixture.

    Returns:
        tuple[FlaskClient, int]: Signed-in client and user ID.
    """
    client = app.test_client()
    response = register(client, name)
    assert response.status_code == HTTPStatus.CREATED, response.json
    assert login(client, name).status_code == HTTPStatus.FORBIDDEN
    message = take_mail(connection, monkeypatch)
    assert message["To"] == f"{name}@example.test"
    token = message.get_content().split("#token=")[1].strip()
    for expected in (HTTPStatus.NO_CONTENT, HTTPStatus.BAD_REQUEST):
        response = client.post("/api/auth/verify", json={"token": token})
        assert response.status_code == expected
    response = login(client, name)
    assert response.status_code == HTTPStatus.OK
    assert (
        "HttpOnly" in response.headers["Set-Cookie"]
        and "SameSite=Lax" in response.headers["Set-Cookie"]
    )
    return client, response.json["id"]
