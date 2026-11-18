import logging
import os
import smtplib
import ssl
import time
from email.message import EmailMessage

import psycopg
from psycopg import Connection

from ..auth.links import link_token
from ..common.db import pool_options
from ..common.limits import MIN_SIGNING_SECRET_LENGTH
from ..common.types import Settings
from .cleanup import clean
from .limits import (
    CLEANUP_INTERVAL_SECONDS,
    LINK_SUBJECTS,
    MAIL_DATABASE_RECONNECT_SECONDS,
    MAIL_POLL_SECONDS,
    MAIL_RETRY_BASE_SECONDS,
    MAIL_RETRY_MAX_EXPONENT,
    MAIL_RETRY_MAX_SECONDS,
    SMTP_TIMEOUT_SECONDS,
)
from .types import MailLink, MailSigningSettings

LOG = logging.getLogger(__name__)


def deliver(row: MailLink, config: MailSigningSettings) -> None:
    """Send the queued account link to its recipient over SMTP.

    Args:
        row (MailLink): Link ID, kind, and destination.
        config (MailSigningSettings): Frontend URL and signing secret.

    Returns:
        None.
    """
    message = EmailMessage()
    message["To"] = row["destination"]
    message["From"] = os.environ["SMTP_FROM"]
    message["Subject"] = LINK_SUBJECTS[row["kind"]]
    domain = config["FRONTEND_URL"]
    token = link_token(row["id"], row["kind"], config["MATCHA_SECRET"])
    # Keep capability tokens out of frontend HTTP request URLs and referrers.
    link = f"{domain}/account/{row['kind']}#token={token}"
    message.set_content(f"{message['Subject']} by opening this link:\n\n{link}\n")
    mode = os.environ.get("SMTP_MODE", "starttls")
    if mode not in {"plain", "starttls", "tls"}:
        raise RuntimeError("SMTP_MODE must be plain, starttls or tls.")
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    context = ssl.create_default_context()
    smtp = (
        smtplib.SMTP_SSL(host, port, timeout=SMTP_TIMEOUT_SECONDS, context=context)
        if mode == "tls"
        else smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT_SECONDS)
    )
    with smtp:
        if mode == "starttls":
            smtp.starttls(context=context)
        if os.environ.get("SMTP_USER"):
            smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(message)


def send_one(connection: Connection, config: MailSigningSettings) -> bool:
    """Claim one due email and deliver, retry, or discard it if expired.

    Args:
        connection (Connection): Psycopg worker connection.
        config (MailSigningSettings): Frontend URL and signing secret.

    Returns:
        bool: Whether an outbox item was processed.
    """
    with connection.transaction():
        row = connection.execute(
            """SELECT l.id, l.kind, l.destination, l.expires_at <= now() AS expired,
                m.attempts
               FROM mail_outbox m JOIN account_links l ON l.id = m.link_id
               WHERE m.next_attempt_at <= now() ORDER BY m.next_attempt_at, l.id
               LIMIT 1 FOR UPDATE OF m SKIP LOCKED"""
        ).fetchone()
        if row is None:
            return False
        if not row["expired"]:
            try:
                link: MailLink = {
                    "id": row["id"],
                    "kind": row["kind"],
                    "destination": row["destination"],
                }
                deliver(link, config)
            except (OSError, smtplib.SMTPException):
                LOG.warning("SMTP delivery failed for outbox item %s", row["id"])
                seconds = min(
                    MAIL_RETRY_MAX_SECONDS,
                    MAIL_RETRY_BASE_SECONDS
                    * 2 ** min(row["attempts"], MAIL_RETRY_MAX_EXPONENT),
                )
                connection.execute(
                    "UPDATE mail_outbox SET attempts = attempts + 1, next_attempt_at "
                    "= now() + %s * interval '1 second' "
                    "WHERE link_id = %s",
                    (seconds, row["id"]),
                )
                return True
        connection.execute("DELETE FROM mail_outbox WHERE link_id = %s", (row["id"],))
        return True


def work_mail(config: Settings) -> None:
    """Run the mail poll and periodic cleanup loop.

    Args:
        config (Settings): Database connection and account-link settings.

    Returns:
        None: Loops until stopped or an unrecoverable error occurs.
    """
    if len(config["MATCHA_SECRET"]) < MIN_SIGNING_SECRET_LENGTH:
        raise RuntimeError(
            "MATCHA_SECRET must contain at least "
            f"{MIN_SIGNING_SECRET_LENGTH} characters."
        )
    signing_settings: MailSigningSettings = {
        "FRONTEND_URL": config["FRONTEND_URL"],
        "MATCHA_SECRET": config["MATCHA_SECRET"],
    }
    next_cleanup = 0
    while True:
        try:
            with psycopg.connect(
                config["DATABASE_URL"], **pool_options()
            ) as connection:
                while True:
                    if time.monotonic() >= next_cleanup:
                        clean(connection)
                        next_cleanup = time.monotonic() + CLEANUP_INTERVAL_SECONDS
                    if not send_one(connection, signing_settings):
                        time.sleep(MAIL_POLL_SECONDS)
        except psycopg.OperationalError:
            LOG.warning(
                "Database unavailable to mail worker. Retrying in %s seconds.",
                MAIL_DATABASE_RECONNECT_SECONDS,
            )
            time.sleep(MAIL_DATABASE_RECONNECT_SECONDS)
