"""Exercise the Compose stack in a disposable project with a fresh database."""

import json
import os
import re
import secrets
import subprocess
import sys
import time
from functools import partial
from http import HTTPStatus
from http.cookiejar import CookieJar
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, OpenerDirector, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]


def request_json(
    client: OpenerDirector, url: str, body: dict[str, str] | None = None
) -> tuple[int, dict | None]:
    """Send an HTTP request and decode its optional JSON response.

    Args:
        client (OpenerDirector): HTTP client with a session cookie jar.
        url (str): API or Mailpit URL.
        body (dict[str, str] | None): JSON payload for POST requests.

    Returns:
        tuple[int, dict | None]: HTTP status and decoded body.
    """
    request = Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    with client.open(request, timeout=5) as response:
        content = response.read()
        return response.status, json.loads(content) if content else None


def wait_for_json(client: OpenerDirector, url: str, field: str) -> dict:
    """Poll for an HTTP 200 response with a populated JSON field.

    Args:
        client (OpenerDirector): Client for the local services.
        url (str): URL to poll.
        field (str): Field that indicates the service has produced a result.

    Returns:
        dict: JSON payload once the field is populated.
    """
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            status, body = request_json(client, url)
            if status == HTTPStatus.OK and body and body.get(field):
                return body
        except (URLError, TimeoutError):
            pass
        time.sleep(1)
    raise AssertionError(f"Timed out waiting for {field!r} at {url}.")


def verify_account_flow(api: str, mailpit: str) -> None:
    """Verify the real email and session flow across the Compose services.

    Args:
        api (str): Published API URL including the /api prefix.
        mailpit (str): Published Mailpit URL.

    Returns:
        None.
    """
    client = build_opener(HTTPCookieProcessor(CookieJar()))
    assert wait_for_json(client, f"{api}/health", "status") == {"status": "ok"}
    username = "compose_smoke"
    email = f"{username}@example.test"
    password = secrets.token_urlsafe(32)
    status, _ = request_json(
        client,
        f"{api}/auth/register",
        {
            "username": username,
            "email": email,
            "first_name": "Compose",
            "last_name": "Smoke",
            "password": password,
        },
    )
    assert status == HTTPStatus.CREATED

    query = urlencode({"query": f"to:{email}"})
    inbox = wait_for_json(client, f"{mailpit}/api/v1/search?{query}", "messages")
    message_id = inbox["messages"][0]["ID"]
    _, message = request_json(client, f"{mailpit}/api/v1/message/{message_id}")
    token = re.search(r"#token=([a-f0-9-]+\.[a-f0-9]+)", message["Text"])
    assert token, "The verification email did not contain a token."
    status, _ = request_json(client, f"{api}/auth/verify", {"token": token[1]})
    assert status == HTTPStatus.NO_CONTENT

    status, _ = request_json(
        client, f"{api}/auth/login", {"username": username, "password": password}
    )
    assert status == HTTPStatus.OK
    status, profile = request_json(client, f"{api}/me")
    assert status == HTTPStatus.OK
    assert profile["username"] == username
    print("Compose startup, SMTP delivery, account verification, and sign-in passed.")


def main() -> None:
    """Build, exercise, and remove one isolated Compose project.

    Returns:
        None.
    """
    project = f"matcha-smoke-{secrets.token_hex(6)}"
    with TemporaryDirectory(prefix="matcha-smoke-") as directory:
        env_file = Path(directory) / ".env"
        template = (ROOT / ".env.example").read_text()
        for key in ("POSTGRES_PASSWORD", "MATCHA_SECRET"):
            template = template.replace(f"{key}=\n", f"{key}={secrets.token_hex(32)}\n")
        env_file.write_text(template)
        env = {
            **os.environ,
            "MATCHA_ENV_FILE": str(env_file),
            "API_PORT": "0",
            "MAILPIT_PORT": "0",
        }
        compose = ["docker", "compose", "--env-file", str(env_file), "-p", project]

        run = partial(subprocess.run, cwd=ROOT, env=env)
        port = partial(subprocess.check_output, cwd=ROOT, env=env, text=True)
        try:
            run(
                [*compose, "up", "--build", "--wait", "--wait-timeout", "90"],
                check=True,
            )
            api = port([*compose, "port", "api", "8000"]).strip()
            mailpit = port([*compose, "port", "mail", "8025"]).strip()
            verify_account_flow(f"http://{api}/api", f"http://{mailpit}")
        except Exception:
            run([*compose, "logs", "--no-color"])
            raise
        finally:
            cleanup = run([*compose, "down", "--volumes", "--remove-orphans"])
            if sys.exception() is None:
                cleanup.check_returncode()


if __name__ == "__main__":
    main()
