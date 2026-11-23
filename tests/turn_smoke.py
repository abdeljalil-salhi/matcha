"""Start the optional TURN relay without networking, devices or database volumes."""

import secrets
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "coturn/coturn:4.18.0-r0"


def main() -> None:
    """Validate relay startup in an isolated container and always remove it.

    Returns:
        None.
    """
    with tempfile.TemporaryDirectory(prefix="matcha-turn-test-") as directory:
        config = Path(directory) / "turnserver.conf"
        config.write_text(
            (ROOT / "infra/turn/turnserver.conf").read_text()
            + "\nlistening-ip=127.0.0.1\nrelay-ip=127.0.0.1\n"
            + f"static-auth-secret={secrets.token_hex(32)}\n"
        )
        # The image runs as nobody; this contains a disposable test secret only.
        config.chmod(0o644)
        container = subprocess.check_output(
            [
                "docker",
                "run",
                "-d",
                "--network",
                "none",
                "--read-only",
                "--tmpfs",
                "/tmp:mode=1777",
                "--cap-drop",
                "ALL",
                "--cap-add",
                "NET_BIND_SERVICE",
                "--security-opt",
                "no-new-privileges:true",
                "--entrypoint",
                "/bin/sh",
                "--mount",
                f"type=bind,source={config},target=/etc/coturn/test.conf,readonly",
                IMAGE,
                "-ec",
                "exec turnserver -c /etc/coturn/test.conf",
            ],
            text=True,
        ).strip()
        try:
            time.sleep(2)
            running = subprocess.check_output(
                ["docker", "inspect", "--format", "{{.State.Running}}", container],
                text=True,
            ).strip()
            logs = subprocess.check_output(
                ["docker", "logs", container],
                text=True,
                stderr=subprocess.STDOUT,
            )
            invalid = any(
                token in logs.lower()
                for token in (
                    "unknown option",
                    "bad configuration",
                    "error",
                    "operation not permitted",
                )
            )
            if running != "true" or invalid:
                raise RuntimeError("TURN startup failed: " + logs[-4000:])
            print(
                "TURN startup passed with networking disabled; no media devices used."
            )
        finally:
            subprocess.run(
                ["docker", "rm", "-f", container],
                check=True,
                stdout=subprocess.DEVNULL,
            )


if __name__ == "__main__":
    main()
