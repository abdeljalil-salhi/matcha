from typing import Literal, TypedDict

type LinkKind = Literal["verify", "reset", "email"]


class VerificationQueued(TypedDict):
    """Response confirming that an account email was queued."""

    status: Literal["verification_queued"]


class Accepted(TypedDict):
    """Generic response for account recovery and verification resend."""

    status: Literal["accepted"]
