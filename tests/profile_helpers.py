import io
from http import HTTPStatus

from PIL import Image
from flask.testing import FlaskClient
from werkzeug.test import TestResponse


def upload(client: FlaskClient, valid: bool = True) -> TestResponse:
    """Submit a valid image or a rejected SVG payload.

    Args:
        client (FlaskClient): Signed-in client.
        valid (bool): Choose the image.

    Returns:
        TestResponse: Upload response.
    """
    image = io.BytesIO()
    if valid:
        Image.new("RGB", (48, 48), "salmon").save(image, "PNG")
    else:
        image.write(
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        )
    image.seek(0)
    return client.post("/api/me/photos", data={"photo": (image, "profile.png")})


def complete(
    client: FlaskClient,
    gender: str,
    seeks: list[str] | None,
    location: str = "Paris",
    tag_list: list[str] | None = None,
) -> int:
    """Populate required profile fields for a test account.

    Args:
        client (FlaskClient): Signed-in client.
        gender (str): Profile gender.
        seeks (list[str] | None): Preferences.
        location (str): City or area.
        tag_list (list[str] | None): Optional replacement tags.

    Returns:
        int: New primary photo ID.
    """
    assert (
        client.patch(
            "/api/me",
            json={
                "birth_date": "1995-02-03",
                "gender": gender,
                "seeks": seeks,
                "bio": "I enjoy bouldering.",
                "tags": tag_list or ["art", "climbing"],
            },
        ).status_code
        == HTTPStatus.NO_CONTENT
    )
    assert (
        client.put(
            "/api/me/location", json={"source": "manual", "query": location}
        ).status_code
        == HTTPStatus.OK
    )
    response = upload(client)
    assert response.status_code == HTTPStatus.CREATED, response.json
    return response.json["id"]
