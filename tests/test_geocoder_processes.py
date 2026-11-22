import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from flask import Flask
from psycopg import Connection

from .geocoder_helpers import RAW_PLACE
from .geocoder_worker import WorkerInput, WorkerOutput


def worker_lookups(app: Flask, queries: tuple[str, str]) -> list[WorkerOutput]:
    """Start two independent app processes together against one test schema.

    Args:
        app (Flask): Source of database settings and isolated search path.
        queries (tuple[str, str]): Concurrent searches to issue.

    Returns:
        list[WorkerOutput]: Results and monotonic transport-start timestamps.
    """
    keys = ("DATABASE_URL", "MATCHA_SECRET", "FRONTEND_URL", "COOKIE_SECURE", "TESTING")
    config = {key: app.config[key] for key in keys}
    processes = []
    try:
        for query in queries:
            process = subprocess.Popen(
                [sys.executable, "-m", "tests.geocoder_worker"],
                cwd=Path(__file__).resolve().parents[1],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            processes.append(process)
            data: WorkerInput = {
                "config": config,
                "options": app.config["DB_CONNECTION_OPTIONS"]["options"],
                "params": {"q": query},
                "path": "search",
                "body": json.dumps([RAW_PLACE]),
            }
            process.stdin.write(json.dumps(data) + "\n")
            process.stdin.flush()
        with ThreadPoolExecutor(max_workers=2) as executor:
            ready = [executor.submit(process.stdout.readline) for process in processes]
            assert all(future.result(timeout=10).strip() == "ready" for future in ready)
        for process in processes:
            process.stdin.write("go\n")
            process.stdin.flush()
        results = []
        for process in processes:
            output, errors = process.communicate(timeout=10)
            assert process.returncode == 0, errors
            results.append(json.loads(output))
        return results
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=5)


def test_separate_workers_share_the_provider_cooldown(
    backend: tuple[Flask, Connection],
) -> None:
    """Space concurrent external attempts across independent Python workers.

    Args:
        backend (tuple[Flask, Connection]): App and isolated PostgreSQL database.

    Returns:
        None.
    """
    app, _ = backend
    results = worker_lookups(app, ("First Place", "Second Place"))
    starts = sorted(result["starts"][0] for result in results)
    assert starts[1] - starts[0] >= 1


def test_separate_workers_coalesce_identical_uncached_requests(
    backend: tuple[Flask, Connection],
) -> None:
    """Fetch a cold lookup only once when two independent workers need it.

    Args:
        backend (tuple[Flask, Connection]): App and isolated PostgreSQL database.

    Returns:
        None.
    """
    app, _ = backend
    results = worker_lookups(app, ("Same Place", "Same Place"))
    assert sum(len(result["starts"]) for result in results) == 1
    assert results[0]["result"] == results[1]["result"]
