from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from pytest import MonkeyPatch
from werkzeug.test import TestResponse

from server.common.db import lock_users


def synchronize_user_locks(monkeypatch: MonkeyPatch, target: str) -> None:
    """Make both requests reach the real user lock before either acquires it.

    Args:
        monkeypatch (MonkeyPatch): Fixture that restores the patched lookup.
        target (str): Module-level lock function used by the operation.

    Returns:
        None.
    """
    barrier = Barrier(2)

    def synchronized_lock(*ids: int) -> list[dict]:
        """Wait for the competing request and acquire the real database lock.

        Args:
            *ids (int): User IDs to lock.

        Returns:
            list[dict]: Locked user rows.
        """
        barrier.wait(timeout=5)
        return lock_users(*ids)

    monkeypatch.setattr(target, synchronized_lock)


def competing_requests(
    first: Callable[[], TestResponse], second: Callable[[], TestResponse]
) -> list[TestResponse]:
    """Run two HTTP requests on separate threads and propagate their failures.

    Args:
        first (Callable[[], TestResponse]): First client's request.
        second (Callable[[], TestResponse]): Second client's request.

    Returns:
        list[TestResponse]: Responses in submission order.
    """
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(first), executor.submit(second)]
        return [future.result(timeout=10) for future in futures]
