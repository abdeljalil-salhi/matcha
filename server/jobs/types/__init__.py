from typing import Literal, TypedDict
from uuid import UUID

from ...auth.types import LinkKind


class SeedPortrait(TypedDict):
    """Trusted metadata for a bundled synthetic adult portrait."""

    id: str
    age: int
    gender: Literal["w", "m", "x"]


class SeedIdentity(TypedDict):
    """Fictional display identity used for a demo account."""

    first_name: str
    last_name: str
    bio: str


class MailLink(TypedDict):
    """Account-link data needed by the SMTP transport."""

    id: UUID
    kind: LinkKind
    destination: str


class MailSigningSettings(TypedDict):
    """Settings needed to generate account URLs."""

    FRONTEND_URL: str
    MATCHA_SECRET: str
