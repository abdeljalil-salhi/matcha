"""Prepare local development configuration using only Python's standard library."""

import os
import re
import secrets
import shlex
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECRET_KEYS = ("POSTGRES_PASSWORD", "MATCHA_SECRET", "SEED_PASSWORD")
ASSIGNMENT = re.compile(r"^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=(.*)$")


def prepare(path: Path, template: Path, secret_keys: tuple[str, ...] = ()) -> bool:
    """Create an environment file and fill missing secrets without rotating values.

    Args:
        path (Path): Local destination.
        template (Path): Tracked default configuration.
        secret_keys (tuple[str, ...]): Keys requiring independent random values.

    Returns:
        bool: Whether the file was created or updated.
    """
    existing = path.exists()
    lines = (path if existing else template).read_text().splitlines()
    positions = {}
    for index, line in enumerate(lines):
        match = ASSIGNMENT.match(line)
        if match:
            positions[match[1]] = (index, match[2])
    changed = not existing
    for key in secret_keys:
        found = positions.get(key)
        if found:
            try:
                values = shlex.split(found[1], comments=True)
            except ValueError:
                raise RuntimeError(
                    f"Check the quoting for {key} in {path.name}."
                ) from None
            if values and any(values):
                continue
            lines[found[0]] = f"{key}={secrets.token_hex(32)}"
        else:
            lines.append(f"{key}={secrets.token_hex(32)}")
        changed = True
    if changed:
        handle, temporary = tempfile.mkstemp(prefix=".matcha-env-", dir=path.parent)
        try:
            with os.fdopen(handle, "w") as output:
                output.write("\n".join(lines) + "\n")
            os.chmod(temporary, 0o600)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return changed


def main() -> None:
    """Initialize development files without printing credential values.

    Returns:
        None.
    """
    for path, template, keys in (
        (ROOT / ".env", ROOT / ".env.example", SECRET_KEYS),
        (ROOT / "frontend/.env", ROOT / "frontend/.env.example", ()),
    ):
        if prepare(path, template, keys):
            print(f"Prepared {path.relative_to(ROOT)} (existing values preserved).")


if __name__ == "__main__":
    main()
