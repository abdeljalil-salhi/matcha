import argparse
import logging
import os

import psycopg

from .common.config import settings
from .common.db import pool_options
from .jobs.mail import work_mail
from .jobs.migrations import migrate
from .jobs.seed import seed


def main() -> None:
    """Parse CLI arguments and dispatch migration, seed, or mail work.

    Returns:
        None.
    """
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Manage the Matcha backend.")
    parser.add_argument("command", choices=("migrate", "seed", "mail"))
    args = parser.parse_args()
    config = settings()
    if args.command == "mail":
        work_mail(config)
        return
    with psycopg.connect(config["DATABASE_URL"], **pool_options()) as connection:
        if args.command == "migrate":
            migrate(connection)
        elif args.command == "seed":
            seed(connection, os.environ.get("SEED_PASSWORD"))


if __name__ == "__main__":
    main()
