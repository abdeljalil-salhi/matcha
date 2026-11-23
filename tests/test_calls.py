import base64
import hashlib
import hmac
import re
import secrets
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

from .helpers import create_user


@pytest.fixture
def callers(backend, monkeypatch):
    """Return three authenticated callers and one connected pair."""
    app, conn = backend
    a, alice = create_user(app, conn, "call_alice", monkeypatch)
    b, bob = create_user(app, conn, "call_bob", monkeypatch)
    c, carol = create_user(app, conn, "call_carol", monkeypatch)
    conn.execute(
        "INSERT INTO likes (actor_id, target_id) VALUES (%s, %s), (%s, %s)",
        (alice, bob, bob, alice),
    )
    return (
        app,
        conn,
        (a, alice, str(uuid4())),
        (b, bob, str(uuid4())),
        (c, carol, str(uuid4())),
    )


def invite(caller, target, mode="audio"):
    """Start an invitation owned by the fixture browser instance."""
    client, _, device = caller
    return client.post(
        "/api/calls", json={"user_id": target, "mode": mode, "device_id": device}
    )


def action(caller, call_id, command):
    """Apply an action as the fixture's browser instance."""
    return caller[0].post(
        f"/api/calls/{call_id}/action", json={"action": command, "device_id": caller[2]}
    )


def send(caller, call_id, kind="offer", payload=None, client_id=None):
    """Send a signaling packet with an idempotency token."""
    return caller[0].post(
        f"/api/calls/{call_id}/signals",
        json={
            "kind": kind,
            "payload": payload or {"sdp": "v=0\r\n"},
            "client_id": client_id or str(uuid4()),
            "device_id": caller[2],
        },
    )


def read(caller, call_id, after=0):
    """Poll only the other participant's setup messages."""
    return caller[0].get(f"/api/calls/{call_id}?device_id={caller[2]}&after={after}")


def test_call_roles_signaling_retries_and_cleanup(callers):
    """Cover accepted audio calls, ownership, signaling order and terminal cleanup."""
    _, conn, a, b, c = callers
    result = invite(a, b[1])
    assert result.status_code == 201, result.json
    call = result.json["call"]
    cid = call["id"]
    assert call["owned"] and call["role"] == "caller"
    assert not {"caller_session", "callee_session", "caller_device"} & call.keys()
    assert read(c, cid).status_code == 404
    assert action(a, cid, "accept").status_code == 403
    assert send(a, cid).status_code == 409
    assert action(b, cid, "accept").json["call"]["owned"]
    assert action((b[0], b[1], str(uuid4())), cid, "accept").status_code == 409
    assert send(b, cid, "answer").status_code == 409
    assert send(b, cid).status_code == 403
    retry = str(uuid4())
    assert send(a, cid, client_id=retry).status_code == 201
    assert send(a, cid, client_id=retry).status_code == 200
    assert (
        send(a, cid, payload={"sdp": "v=0\r\nchanged"}, client_id=retry).status_code
        == 409
    )
    assert send(a, cid).status_code == 409
    assert send(b, cid, "answer").status_code == 201
    packets = read(b, cid).json["signals"]
    assert [packet["kind"] for packet in packets] == ["offer"]
    assert read(b, cid, packets[-1]["id"]).json["signals"] == []
    assert read((b[0], b[1], str(uuid4())), cid).json["signals"] == []
    assert action(a, cid, "end").json["call"]["state"] == "ended"
    assert action(a, cid, "end").status_code == 200
    assert conn.execute("SELECT count(*) n FROM call_signals").fetchone()["n"] == 0
    assert conn.execute("SELECT count(*) n FROM call_participants").fetchone()["n"] == 0
    assert read(b, cid).json["call"]["state"] == "ended"
    assert invite(b, a[1], "video").status_code == 201


def test_call_access_busy_expiry_and_signout(callers):
    """Require mutual likes, release timed-out leases and stop revoked sessions."""
    app, conn, a, b, c = callers
    assert app.test_client().get("/api/calls/current").status_code == 401
    assert invite(a, a[1]).status_code == 422
    assert invite(c, a[1]).status_code == 403
    cid = invite(a, b[1]).json["call"]["id"]
    assert invite(b, a[1]).status_code == 409
    conn.execute(
        "UPDATE calls SET created_at = now() - interval '1 minute' WHERE id = %s",
        (cid,),
    )
    assert read(b, cid).json["call"]["state"] == "missed"
    cid = invite(a, b[1], "video").json["call"]["id"]
    assert action(b, cid, "accept").status_code == 200
    assert (
        a[0]
        .post(f"/api/calls/{cid}/heartbeat", json={"device_id": str(uuid4())})
        .status_code
        == 409
    )
    conn.execute(
        "UPDATE call_participants SET heartbeat_at = now() - interval '1 minute' "
        "WHERE user_id = %s",
        (b[1],),
    )
    assert read(a, cid).json["call"]["state"] == "ended"
    cid = invite(a, b[1]).json["call"]["id"]
    assert action(b, cid, "accept").status_code == 200
    assert b[0].post("/api/auth/logout").status_code == 204
    assert read(a, cid).json["call"]["state"] == "ended"


@pytest.mark.parametrize("withdraw", ["block", "like"])
def test_calls_end_when_connection_is_lost(callers, withdraw):
    """Prevent signaling and expire both participants when blocking or unliking."""
    _, conn, a, b, _ = callers
    cid = invite(a, b[1]).json["call"]["id"]
    action(b, cid, "accept")
    if withdraw == "block":
        assert b[0].put(f"/api/profiles/{a[1]}/block").status_code == 204
    else:
        assert b[0].delete(f"/api/profiles/{a[1]}/like").status_code == 204
    assert send(a, cid).status_code == 403
    assert read(a, cid).json["call"]["state"] == "ended"
    assert conn.execute("SELECT count(*) n FROM call_participants").fetchone()["n"] == 0


def test_simultaneous_invites_reserve_one_call(callers):
    """Ordered participant locks prevent crossed or overlapping invitations."""
    _, conn, a, b, _ = callers
    barrier = Barrier(2)

    def start(caller, peer):
        barrier.wait(timeout=5)
        return invite(caller, peer).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(start, a, b[1])
        second = executor.submit(start, b, a[1])
        assert sorted((first.result(), second.result())) == [201, 409]
    assert conn.execute("SELECT count(*) n FROM calls").fetchone()["n"] == 1
    assert conn.execute("SELECT count(*) n FROM call_participants").fetchone()["n"] == 2


def test_call_validation_and_temporary_turn_credentials(callers):
    """Reject malformed or oversized packets and keep TURN shared secrets private."""
    app, _, a, b, _ = callers
    for mode in ("screen", [], None, True):
        assert invite(a, b[1], mode).status_code == 422
    cid = invite(a, b[1]).json["call"]["id"]
    action(b, cid, "accept")
    assert send(a, cid, payload={"sdp": "v=0" + "x" * 65536}).status_code == 422
    assert (
        send(a, cid, "ice", {"candidate": "x", "sdpMLineIndex": True}).status_code
        == 422
    )
    assert send(a, cid, "ice", {"candidate": "x", "unsupported": 1}).status_code == 422
    assert (
        send(
            a,
            cid,
            "ice",
            {"candidate": "candidate:1", "sdpMid": "0", "sdpMLineIndex": 0},
        ).status_code
        == 201
    )
    assert a[0].get("/api/calls/current?device_id=bad").status_code == 422
    secret = secrets.token_hex(32)
    app.config.update(
        CALL_TURN_URLS=["turn:relay.example.test:3478"],
        CALL_TURN_SECRET=secret,
        CALL_RELAY_ONLY=True,
    )
    config = a[0].get("/api/calls/ice").json
    assert config["iceTransportPolicy"] == "relay"
    server = config["iceServers"][0]
    expected = base64.b64encode(
        hmac.new(secret.encode(), server["username"].encode(), hashlib.sha1).digest()
    ).decode()
    assert server["credential"] == expected
    assert secret not in str(config)
    assert re.fullmatch(r"\d+:[0-9a-f]{32}", server["username"])


def test_signal_pagination_leases_declines_and_private_ownership(callers):
    """Page candidate bursts and ensure reads cannot renew media leases."""
    _, conn, a, b, c = callers
    cid = invite(a, b[1]).json["call"]["id"]
    assert action(a, cid, "decline").status_code == 409
    assert action(b, cid, "cancel").status_code == 409
    assert action(c, cid, "end").status_code == 404
    assert action(b, cid, "decline").json["call"]["state"] == "declined"
    cid = invite(a, b[1]).json["call"]["id"]
    assert action(b, cid, "accept").status_code == 200
    for index in range(103):
        conn.execute(
            "INSERT INTO call_signals (call_id, sender_id, client_id, kind, payload) "
            "VALUES (%s, %s, %s, 'ice', jsonb_build_object('candidate', %s::text))",
            (cid, a[1], uuid4(), f"candidate:{index}"),
        )
    page = read(b, cid).json
    assert len(page["signals"]) == 100 and page["has_more"]
    second = read(b, cid, page["signals"][-1]["id"]).json
    assert len(second["signals"]) == 3 and not second["has_more"]
    assert second["signals"][0]["id"] > page["signals"][-1]["id"]
    before = conn.execute(
        "SELECT heartbeat_at FROM call_participants WHERE user_id = %s", (b[1],)
    ).fetchone()["heartbeat_at"]
    read(b, cid)
    assert (
        conn.execute(
            "SELECT heartbeat_at FROM call_participants WHERE user_id = %s", (b[1],)
        ).fetchone()["heartbeat_at"]
        == before
    )
    assert (
        b[0].post(f"/api/calls/{cid}/heartbeat", json={"device_id": b[2]}).status_code
        == 200
    )
    assert (
        conn.execute(
            "SELECT heartbeat_at FROM call_participants WHERE user_id = %s", (b[1],)
        ).fetchone()["heartbeat_at"]
        > before
    )
    action(a, cid, "end")
    conn.execute("UPDATE calls SET ended_at = now() - interval '2 days'")
    a[0].get(f"/api/calls/current?device_id={a[2]}")
    assert conn.execute("SELECT count(*) n FROM calls").fetchone()["n"] == 0


def test_call_media_ownership_is_bound_to_the_auth_session(callers):
    """Even the same account and device UUID cannot take over via a new session."""
    from .helpers import login

    app, _, a, b, _ = callers
    cid = invite(a, b[1]).json["call"]["id"]
    action(b, cid, "accept")
    other_session = app.test_client()
    assert login(other_session, "call_alice").status_code == 200
    impostor = (other_session, a[1], a[2])
    assert read(impostor, cid).json["call"]["owned"] is False
    assert read(impostor, cid).json["signals"] == []
    assert send(impostor, cid).status_code == 409
