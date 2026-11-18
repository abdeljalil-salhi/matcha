from typing import TypedDict
from uuid import UUID

from ...auth.types import LinkKind


class MailLink(TypedDict):
    """Account-link data needed by the SMTP transport."""

    id: UUID
    kind: LinkKind
    destination: str


class MailSigningSettings(TypedDict):
    """Settings needed to generate account URLs."""

    FRONTEND_URL: str
    MATCHA_SECRET: str
