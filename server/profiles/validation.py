import re
from datetime import date
from http import HTTPStatus

from ..common.http import ApiError
from ..common.validation import text
from .limits import MAX_PROFILE_AGE, MIN_PROFILE_AGE

ISO_DATE_LENGTH = 10
GENDERS = ("woman", "man", "nonbinary", "other")


def birth_date(value: str) -> date:
    """Parse a birth date and require an age from 18 to 120.

    Args:
        value (str): Birth date in YYYY-MM-DD format.

    Returns:
        date: Validated birth date.
    """
    try:
        if not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}", text(value, "birth_date", ISO_DATE_LENGTH)
        ):
            raise ValueError
        birthday = date.fromisoformat(value)
    except ValueError:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Use YYYY-MM-DD for birth_date."
        ) from None
    today = date.today()
    age = (
        today.year
        - birthday.year
        - ((today.month, today.day) < (birthday.month, birthday.day))
    )
    if not MIN_PROFILE_AGE <= age <= MAX_PROFILE_AGE:
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY, "Age must be between 18 and 120."
        )
    return birthday
