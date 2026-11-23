import pytest

from server.common.config import settings


@pytest.mark.parametrize(
    "overrides",
    [
        {"CALL_TURN_URLS": "https://relay.example.test", "CALL_TURN_SECRET": "x" * 32},
        {"CALL_TURN_URLS": "turn:relay.example.test", "CALL_TURN_SECRET": "short"},
        {"CALL_STUN_URLS": "https://stun.example.test"},
        {"CALL_RELAY_ONLY": "true"},
    ],
)
def test_invalid_relay_configuration_fails_closed(monkeypatch, overrides):
    """Reject missing secrets and relay-only configurations without a relay."""
    monkeypatch.setattr("server.common.config.load_dotenv", lambda: None)
    monkeypatch.setenv("DATABASE_URL", "postgresql://test@localhost/test")
    monkeypatch.setenv("FRONTEND_URL", "https://matcha.example.test")
    for key in (
        "CALL_TURN_URLS",
        "CALL_STUN_URLS",
        "CALL_TURN_SECRET",
        "CALL_RELAY_ONLY",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in overrides.items():
        monkeypatch.setenv(key, value)
    with pytest.raises(RuntimeError):
        settings()
