from http import HTTPStatus
from typing import cast

from flask import current_app
from itsdangerous import BadData, URLSafeTimedSerializer

from ..common.http import ApiError
from .limits import (
    CITY_CONFIRMATION_MAX_AGE_SECONDS,
    CITY_CONFIRMATION_SALT,
    LOCATION_DECIMAL_PLACES,
    MAX_CITY_CONFIRMATION_TOKEN_LENGTH,
)
from .types import CityConfirmationData, CitySuggestion, Place


class CityConfirmationRequired(ApiError):
    def __init__(self, place: Place) -> None:
        """Interrupt a GPS save when a city needs explicit manual confirmation.

        Args:
            place (Place): Resolved city without a usable neighborhood.

        Returns:
            None.
        """
        super().__init__(
            HTTPStatus.CONFLICT, "Confirm the city as your approximate location."
        )
        self.place = place


def city_serializer() -> URLSafeTimedSerializer:
    """Build the signer for account-bound, short-lived city suggestions.

    Args:
        None.

    Returns:
        URLSafeTimedSerializer: Signer scoped to city confirmation only.
    """
    return URLSafeTimedSerializer(
        current_app.config["MATCHA_SECRET"], salt=CITY_CONFIRMATION_SALT
    )


def city_suggestion(place: Place, user_id: int) -> CitySuggestion:
    """Sign a rounded city result without saving any account location fields.

    Args:
        place (Place): Validated provider result with an absent neighborhood.
        user_id (int): Authenticated account allowed to confirm this result.

    Returns:
        CitySuggestion: City, country, and a ten-minute confirmation token.
    """
    city, _, country, lat, lon = place
    data: CityConfirmationData = {
        "user_id": user_id,
        "city": city,
        "country_code": country,
        "latitude": round(lat, LOCATION_DECIMAL_PLACES),
        "longitude": round(lon, LOCATION_DECIMAL_PLACES),
    }
    return {
        "city": city,
        "country_code": country,
        "confirmation_token": city_serializer().dumps(data),
    }


def confirmed_city(token: str, user_id: int) -> Place:
    """Verify an account-bound suggestion before accepting it as manual location.

    Args:
        token (str): Server-issued city suggestion token.
        user_id (int): Authenticated account performing the confirmation.

    Returns:
        Place: Signed approximate city coordinates with no neighborhood.
    """
    invalid = ApiError(
        HTTPStatus.UNPROCESSABLE_ENTITY,
        "City suggestion expired or invalid. Detect your location again.",
    )
    if len(token) > MAX_CITY_CONFIRMATION_TOKEN_LENGTH:
        raise invalid
    try:
        data = cast(
            CityConfirmationData,
            city_serializer().loads(
                token,
                max_age=CITY_CONFIRMATION_MAX_AGE_SECONDS,
            ),
        )
    except BadData:
        raise invalid from None
    if data["user_id"] != user_id:
        raise invalid
    return data["city"], None, data["country_code"], data["latitude"], data["longitude"]
