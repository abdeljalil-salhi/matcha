import re
import unicodedata
from collections.abc import Iterable
from functools import lru_cache
from http import HTTPStatus

from email_validator import EmailNotValidError, validate_email
from wordfreq import available_languages, get_frequency_dict

from ..common.http import ApiError
from ..common.validation import text
from .limits import (
    MAX_EMAIL_LENGTH,
    MAX_PASSWORD_LENGTH,
    MAX_USERNAME_LENGTH,
    MIN_PASSWORD_LENGTH,
    MIN_USERNAME_LENGTH,
)

COMMON_WORD_MIN_FREQUENCY = 1e-5
MIN_PASSWORD_DISTINCT_CHARACTERS = 5
MIN_RELATED_PASSWORD_TERM_LENGTH = 3


def username(value: str) -> str:
    """Validate and normalize a username.

    Args:
        value (str): Raw username.

    Returns:
        str: Lowercase username.
    """
    result = text(value, "username", MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH).lower()
    if not re.fullmatch(r"[a-z0-9_]+", result):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Use only ASCII letters, digits and underscores in your username.",
        )
    return result


def email_address(value: str) -> str:
    """Validate an address and normalize it for account lookup.

    Args:
        value (str): Raw email address.

    Returns:
        str: Lowercase ASCII email address.
    """
    try:
        result = validate_email(
            text(value, "email", MAX_EMAIL_LENGTH),
            check_deliverability=False,
            allow_smtputf8=False,
            test_environment=True,
        )
    except EmailNotValidError:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Enter a valid email address."
        ) from None
    return result.ascii_email.lower()


@lru_cache(maxsize=1)
def common_words() -> set[str]:
    """Cache frequent alphabetic words from the available dictionaries.

    Returns:
        set[str]: Case-folded common words.
    """
    words = set()
    for language in available_languages(wordlist="small"):
        for word, frequency in get_frequency_dict(language, wordlist="small").items():
            if frequency >= COMMON_WORD_MIN_FREQUENCY and word.isalpha():
                words.add(word.casefold())
    return words


def password(value: str, related: Iterable[str] = ()) -> str:
    """Reject short, predictable, and dictionary-derived passwords.

    Args:
        value (str): Candidate password.
        related (Iterable[str]): Account terms to reject as passwords.

    Returns:
        str: Original password after validation.
    """
    value = text(
        value, "password", MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, strip=False
    )
    normalized = unicodedata.normalize("NFKC", value).casefold()
    reduced = "".join(c for c in normalized if c.isalpha())
    if (
        len(set(normalized)) < MIN_PASSWORD_DISTINCT_CHARACTERS
        or reduced in common_words()
        or any(
            len(item) >= MIN_RELATED_PASSWORD_TERM_LENGTH and item.casefold() == reduced
            for item in related
        )
        or re.search(
            r"password|qwerty|azerty|123456|motdepasse|contraseña|passwort", normalized
        )
    ):
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Choose a password without common words or predictable patterns.",
        )
    return value
