import base64
import hashlib
import hmac
import secrets
import time

from flask import Blueprint, current_app, g

from ..auth.guard import signed_in
from ..common.http import rate_limit
from .limits import TURN_TTL_SECONDS

routes = Blueprint("call_ice", __name__)


@routes.get("/calls/ice")
@signed_in
def ice_configuration() -> dict:
    """Issue temporary coturn credentials without exposing the shared secret.

    Returns:
        dict: Browser ICE server configuration and transport policy.
    """
    rate_limit(f"call:ice:{g.user_id}", 20)
    servers = []
    stun = current_app.config.get("CALL_STUN_URLS", [])
    turn = current_app.config.get("CALL_TURN_URLS", [])
    secret = current_app.config.get("CALL_TURN_SECRET", "")
    if stun:
        servers.append({"urls": stun})
    if turn and secret:
        # coturn REST credentials are "expiration:random-name" plus an HMAC-SHA1
        # of that name. The user ID is deliberately not included: the relay does
        # not need it, and this avoids exposing account IDs in relay logs.
        username = f"{int(time.time()) + TURN_TTL_SECONDS}:{secrets.token_hex(16)}"
        credential = base64.b64encode(
            hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()
        ).decode()
        servers.append({"urls": turn, "username": username, "credential": credential})
    return {
        "iceServers": servers,
        "iceTransportPolicy": (
            "relay" if current_app.config.get("CALL_RELAY_ONLY") else "all"
        ),
    }
