"""Persistent proposals, participant permissions and safe lifecycle transitions."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest

from .helpers import create_user
from .profile_helpers import complete


def connected_pair(backend, monkeypatch):
    """Create two completed, mutually connected test members."""
    app, connection = backend
    alice, alice_id = create_user(app, connection, "alice", monkeypatch)
    bob, bob_id = create_user(app, connection, "bobby", monkeypatch)
    complete(alice, "woman", None)
    complete(bob, "man", None)
    assert alice.put(f"/api/profiles/{bob_id}/like").status_code == 200
    assert bob.put(f"/api/profiles/{alice_id}/like").status_code == 200
    return alice, alice_id, bob, bob_id


def proposal(**changes):
    """Return a future wall-time proposal with a fresh retry key."""
    return {
        "client_id": str(uuid4()),
        "title": "Coffee and a walk",
        "local_time": "2050-06-15T18:30",
        "timezone": "Europe/Paris",
        "venue": "Central café",
        "notes": "Meet by the entrance.",
        **changes,
    }


def test_plan_retry_and_notification(backend, monkeypatch):
    """Retried creation keeps one original proposal and one invitation event."""
    alice, alice_id, bob, bob_id = connected_pair(backend, monkeypatch)
    data = proposal()
    first = alice.post(f"/api/chat/{bob_id}/plans", json=data)
    assert first.status_code == 201, first.json
    plan = first.json
    assert plan["state"] == "proposed"
    assert plan["starts_at"].startswith("2050-06-15T16:30")
    retry = alice.post(f"/api/chat/{bob_id}/plans", json=data)
    assert retry.status_code == 200 and retry.json["id"] == plan["id"]
    assert (
        alice.post(
            f"/api/chat/{bob_id}/plans", json={**data, "venue": "Elsewhere"}
        ).status_code
        == 409
    )
    connection = backend[1]
    assert (
        connection.execute("SELECT count(*) AS n FROM date_plan_history").fetchone()[
            "n"
        ]
        == 1
    )
    assert (
        connection.execute(
            "SELECT count(*) AS n FROM notifications WHERE kind = 'plan'"
        ).fetchone()["n"]
        == 1
    )
    entries = bob.get("/api/notifications").json["notifications"]
    assert any(
        entry["kind"] == "plan" and entry["actor_id"] == alice_id for entry in entries
    )

    messages = bob.get(f"/api/chat/{alice_id}/messages").json["messages"]
    assert len(messages) == 1
    message = messages[0]
    assert message["plan_id"] == plan["id"] and message["plan_version"] == 1
    assert message["plan_action"] == "propose"
    assert message["body"] == "Date invitation: Coffee and a walk"
    assert message["plan_snapshot"]["venue"] == data["venue"]
    invitation = next(entry for entry in entries if entry["kind"] == "plan")
    assert invitation["message_id"] == message["id"]
    assert bob.get("/api/notifications").json["unread"]["messages"] == 1
    receipts = alice.get(f"/api/chat/{bob_id}/messages").json["receipts"]
    assert receipts["delivered_through"] == message["id"]
    assert (
        bob.put(
            f"/api/chat/{alice_id}/read", json={"through": message["id"]}
        ).status_code
        == 204
    )
    assert bob.put(f'/api/notifications/{invitation["id"]}/read').status_code == 204
    assert bob.get("/api/notifications").json["unread"]["messages"] == 0
    receipts = alice.get(f"/api/chat/{bob_id}/messages").json["receipts"]
    assert receipts["read_through"] == message["id"]


def test_accept_reschedule_and_version_conflicts(backend, monkeypatch):
    """Only the invitee confirms, and a new proposal needs fresh acceptance."""
    alice, alice_id, bob, bob_id = connected_pair(backend, monkeypatch)
    data = proposal()
    plan = alice.post(f"/api/chat/{bob_id}/plans", json=data).json
    url = f'/api/plans/{plan["id"]}'
    assert alice.patch(url, json={"action": "accept", "version": 1}).status_code == 403
    accepted = bob.patch(url, json={"action": "accept", "version": 1})
    assert accepted.status_code == 200 and accepted.json["state"] == "accepted"
    assert bob.patch(url, json={"action": "cancel", "version": 1}).status_code == 409
    details = {key: value for key, value in data.items() if key != "client_id"}
    details["local_time"] = "2050-06-16T18:30"
    changed = bob.patch(url, json={"action": "reschedule", "version": 2, **details})
    assert changed.json["state"] == "proposed" and changed.json["proposed_by"] == bob_id
    assert bob.patch(url, json={"action": "accept", "version": 3}).status_code == 403
    assert (
        alice.patch(url, json={"action": "accept", "version": 3}).json["state"]
        == "accepted"
    )
    # Retrying the initial POST after later revisions still resolves to this plan.
    assert alice.post(f"/api/chat/{bob_id}/plans", json=data).json["version"] == 4
    assert len(alice.get("/api/me/plans").json["plans"]) == 1
    assert bob.get(f"/api/chat/{alice_id}/plans").json["plans"][0]["version"] == 4
    assert (
        backend[1]
        .execute("SELECT count(*) AS n FROM date_plan_history")
        .fetchone()["n"]
        == 4
    )

    messages = alice.get(f"/api/chat/{bob_id}/messages").json["messages"]
    assert [message["plan_action"] for message in messages] == [
        "propose",
        "accept",
        "reschedule",
        "accept",
    ]
    assert [message["plan_version"] for message in messages] == [1, 2, 3, 4]
    assert messages[0]["plan_snapshot"]["starts_at"].startswith("2050-06-15")
    assert messages[2]["plan_snapshot"]["starts_at"].startswith("2050-06-16")
    assert messages[0]["plan_snapshot"]["state"] == "proposed"
    assert messages[-1]["plan_snapshot"]["state"] == "accepted"
    assert len({message["client_id"] for message in messages}) == 4


@pytest.mark.parametrize("action", ["decline", "cancel"])
def test_terminal_responses(backend, monkeypatch, action):
    """Declined and cancelled plans cannot later be accepted or edited."""
    alice, _, bob, bob_id = connected_pair(backend, monkeypatch)
    plan = alice.post(f"/api/chat/{bob_id}/plans", json=proposal()).json
    url = f'/api/plans/{plan["id"]}'
    response = bob.patch(url, json={"action": action, "version": 1})
    assert (
        response.json["state"] == {"decline": "declined", "cancel": "cancelled"}[action]
    )
    assert bob.patch(url, json={"action": "accept", "version": 2}).status_code == 409
    assert alice.get("/api/me/plans").json["plans"] == []


@pytest.mark.parametrize("end", ["unlike", "block"])
def test_connection_loss_cancels_plans(backend, monkeypatch, end):
    """Connection changes cancel active plans in the same transaction."""
    alice, _, bob, bob_id = connected_pair(backend, monkeypatch)
    plan = alice.post(f"/api/chat/{bob_id}/plans", json=proposal()).json
    assert (
        bob.patch(
            f'/api/plans/{plan["id"]}', json={"action": "accept", "version": 1}
        ).status_code
        == 200
    )
    response = (
        alice.delete(f"/api/profiles/{bob_id}/like")
        if end == "unlike"
        else alice.put(f"/api/profiles/{bob_id}/block")
    )
    assert response.status_code == 204
    saved = (
        backend[1]
        .execute("SELECT * FROM date_plans WHERE id = %s", (plan["id"],))
        .fetchone()
    )
    assert saved["state"] == "cancelled" and saved["version"] == 3
    assert saved["cancellation_reason"] == "Connection ended"
    assert (
        bob.patch(
            f'/api/plans/{plan["id"]}', json={"action": "accept", "version": 3}
        ).status_code
        == 403
    )
    assert alice.get("/api/me/plans").json["plans"] == []


def test_unconnected_and_outsider_access(backend, monkeypatch):
    """Plan contents are restricted to the two matched participants."""
    alice, _, bob, bob_id = connected_pair(backend, monkeypatch)
    outsider, outsider_id = create_user(*backend, "outside", monkeypatch)
    plan = alice.post(f"/api/chat/{bob_id}/plans", json=proposal()).json
    assert outsider.get(f"/api/chat/{bob_id}/plans").status_code == 403
    assert (
        outsider.post(f"/api/chat/{bob_id}/plans", json=proposal()).status_code == 403
    )
    assert (
        outsider.patch(
            f'/api/plans/{plan["id"]}', json={"action": "accept", "version": 1}
        ).status_code
        == 404
    )
    assert alice.get(f"/api/chat/{outsider_id}/plans").status_code == 403
    assert backend[0].test_client().get("/api/me/plans").status_code == 401


@pytest.mark.parametrize(
    "changes",
    [
        {"local_time": "2020-01-01T18:30"},
        {"timezone": "Unknown/Zone"},
        {"local_time": "2027-03-28T02:30"},
        {"local_time": "2027-10-31T02:30"},
        {"local_time": "2050-01-01T18:30+01:00"},
        {"title": " "},
        {"venue": ""},
        {"notes": "x" * 1001},
        {"client_id": "bad"},
        {"local_time": "bad"},
    ],
)
def test_plan_validation(backend, monkeypatch, changes):
    """Invalid details and ambiguous or nonexistent local times are rejected."""
    alice, _, _, bob_id = connected_pair(backend, monkeypatch)
    response = alice.post(f"/api/chat/{bob_id}/plans", json=proposal(**changes))
    assert response.status_code == 422, response.json
    assert (
        backend[1].execute("SELECT count(*) AS n FROM date_plans").fetchone()["n"] == 0
    )


def test_concurrent_responses_only_apply_one_version(backend, monkeypatch):
    """Pair locking and version checks serialize conflicting participant actions."""
    alice, _, bob, bob_id = connected_pair(backend, monkeypatch)
    plan = alice.post(f"/api/chat/{bob_id}/plans", json=proposal()).json
    url = f'/api/plans/{plan["id"]}'
    with ThreadPoolExecutor(max_workers=2) as executor:
        accept = executor.submit(
            bob.patch, url, json={"action": "accept", "version": 1}
        )
        cancel = executor.submit(
            alice.patch, url, json={"action": "cancel", "version": 1}
        )
        assert sorted([accept.result().status_code, cancel.result().status_code]) == [
            200,
            409,
        ]
    assert (
        backend[1]
        .execute("SELECT count(*) AS n FROM date_plan_history")
        .fetchone()["n"]
        == 2
    )


def test_retry_race_creates_one_plan(backend, monkeypatch):
    """Concurrent retries share one persisted proposal and one notification."""
    alice, _, _, bob_id = connected_pair(backend, monkeypatch)
    data = proposal()
    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(alice.post, f"/api/chat/{bob_id}/plans", json=data)
        second = executor.submit(alice.post, f"/api/chat/{bob_id}/plans", json=data)
        responses = [first.result(), second.result()]
    assert sorted(response.status_code for response in responses) == [200, 201]
    assert responses[0].json["id"] == responses[1].json["id"]
    assert (
        backend[1].execute("SELECT count(*) AS n FROM date_plans").fetchone()["n"] == 1
    )


def test_pagination_expiration_and_invalid_actions(backend, monkeypatch):
    """Lists stay bounded and expired or invalid updates cannot change plans."""
    alice, alice_id, bob, bob_id = connected_pair(backend, monkeypatch)
    first = alice.post(f"/api/chat/{bob_id}/plans", json=proposal()).json
    second = alice.post(
        f"/api/chat/{bob_id}/plans", json=proposal(local_time="2050-06-16T18:30")
    ).json
    page = alice.get(f"/api/chat/{bob_id}/plans?limit=1").json
    assert page["has_more"] and page["plans"][0]["id"] == first["id"]
    assert (
        alice.get(f"/api/chat/{bob_id}/plans?limit=1&offset=1").json["plans"][0]["id"]
        == second["id"]
    )
    assert alice.get("/api/me/plans?limit=0").status_code == 422
    for body in [
        {"action": "unknown", "version": 1},
        {"action": "accept", "version": True},
        {"action": "accept", "version": 0},
        {"action": "accept", "version": 1, "title": "Silently edit"},
        {"action": "reschedule", "version": 1},
    ]:
        assert bob.patch(f'/api/plans/{first["id"]}', json=body).status_code == 422
    connection = backend[1]
    connection.execute(
        "UPDATE date_plans SET starts_at = now() - interval '1 day' WHERE id = %s",
        (first["id"],),
    )
    connection.commit()
    assert (
        bob.patch(
            f'/api/plans/{first["id"]}', json={"action": "accept", "version": 1}
        ).status_code
        == 409
    )
    assert [p["id"] for p in bob.get("/api/me/plans").json["plans"]] == [second["id"]]
    assert (
        bob.get(f"/api/chat/{alice_id}/plans?limit=1").json["plans"][0]["id"]
        == second["id"]
    )


def test_client_cannot_forge_plan_messages(backend, monkeypatch):
    """Structured revisions are only generated by validated plan actions."""
    alice, _, _, bob_id = connected_pair(backend, monkeypatch)
    response = alice.post(
        f"/api/chat/{bob_id}/messages",
        json={
            "client_id": str(uuid4()),
            "body": "Date confirmed",
            "plan_id": 1,
            "plan_action": "accept",
            "plan_snapshot": {"state": "accepted"},
        },
    )
    assert response.status_code == 422
    assert backend[1].execute("SELECT count(*) AS n FROM messages").fetchone()["n"] == 0


def test_existing_plan_revisions_are_backfilled_into_chat(backend, monkeypatch):
    """Upgrade preserves older proposal snapshots and notification links."""
    alice, alice_id, bob, bob_id = connected_pair(backend, monkeypatch)
    plan = alice.post(f"/api/chat/{bob_id}/plans", json=proposal()).json
    assert (
        bob.patch(
            f'/api/plans/{plan["id"]}', json={"action": "accept", "version": 1}
        ).status_code
        == 200
    )
    connection = backend[1]
    # Reproduce the pre-019 layout in this disposable test schema only.
    with connection.transaction():
        connection.execute(
            "UPDATE notifications SET message_id = NULL WHERE kind = 'plan'"
        )
        connection.execute("DELETE FROM messages WHERE plan_id IS NOT NULL")
        connection.execute(
            "ALTER TABLE notifications DROP CONSTRAINT notifications_message_kind"
        )
        connection.execute(
            "ALTER TABLE notifications ADD CONSTRAINT notifications_check "
            "CHECK ((kind = 'message') = (message_id IS NOT NULL))"
        )
        connection.execute(
            "ALTER TABLE messages DROP COLUMN plan_id CASCADE, "
            "DROP COLUMN plan_version, DROP COLUMN plan_action, "
            "DROP COLUMN plan_snapshot"
        )
        migration = (
            Path(__file__).resolve().parents[1] / "sql" / "019_plan_messages.sql"
        )
        connection.execute(migration.read_text(), prepare=False)
    messages = bob.get(f"/api/chat/{alice_id}/messages").json["messages"]
    assert [item["plan_action"] for item in messages] == ["propose", "accept"]
    assert messages[0]["plan_snapshot"]["state"] == "proposed"
    assert messages[1]["plan_snapshot"]["state"] == "accepted"
    for client in (alice, bob):
        notice = next(
            item
            for item in client.get("/api/notifications").json["notifications"]
            if item["kind"] == "plan"
        )
        assert notice["message_id"] in {item["id"] for item in messages}
