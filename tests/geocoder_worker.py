"""Subprocess fixture for proving shared state without shared Python memory."""

import json
import os
import sys
from typing import TypedDict
from unittest.mock import patch

from server import create_app
from server.common.db import pool_options
from server.common.types import JsonValue
from server.location.provider import provider
from server.location.types import GeocoderEndpoint

from .geocoder_helpers import GeocoderStub


class WorkerInput(TypedDict):
    """Serialized test configuration received from the parent process."""

    config: dict[str, JsonValue]
    options: str
    params: dict[str, str | int | float]
    path: GeocoderEndpoint
    body: str


class WorkerOutput(TypedDict):
    """Lookup result and recorded transport timings from one fresh worker."""

    result: JsonValue
    starts: list[float]


def main() -> None:
    """Wait for a synchronized start and run one lookup in a fresh process.

    Args:
        None. Test configuration and start signal arrive on standard input.

    Returns:
        None. Results and external-call timestamps are written as JSON to stdout.
    """
    data: WorkerInput = json.loads(sys.stdin.readline())
    options = pool_options()
    options["options"] = data["options"]
    config = {**data["config"], "DB_CONNECTION_OPTIONS": options}
    os.environ["GEOCODER_URL"] = "https://geocoder.example.test"
    app = create_app(config)
    stub = GeocoderStub(data["body"].encode())
    try:
        print("ready", flush=True)
        sys.stdin.readline()
        with patch("server.location.transport.urlopen", stub), app.app_context():
            result = provider(data["path"], data["params"])
        print(json.dumps({"result": result, "starts": stub.starts}), flush=True)
    finally:
        app.extensions["db"].close()


if __name__ == "__main__":
    main()
