"""Offline checks for fresh-clone environment preparation."""

import stat

import pytest

from scripts.bootstrap_env import SECRET_KEYS, prepare


def test_fresh_clone_generates_independent_secrets(tmp_path):
    template = tmp_path / ".env.example"
    template.write_text("API_PORT=8000\n" + "".join(f"{key}=\n" for key in SECRET_KEYS))
    destination = tmp_path / ".env"

    assert prepare(destination, template, SECRET_KEYS)
    content = destination.read_text()
    values = dict(line.split("=", 1) for line in content.splitlines())
    assert values["API_PORT"] == "8000"
    assert len({values[key] for key in SECRET_KEYS}) == len(SECRET_KEYS)
    assert all(len(values[key]) == 64 for key in SECRET_KEYS)
    assert stat.S_IMODE(destination.stat().st_mode) == 0o600
    assert not prepare(destination, template, SECRET_KEYS)
    assert destination.read_text() == content


def test_preserves_existing_settings_and_fills_only_empty_secrets(tmp_path):
    destination = tmp_path / ".env"
    destination.write_text(
        'API_PORT=8001\nexport MATCHA_SECRET="keep # this" # comment\n'
        "POSTGRES_PASSWORD=''\nSEED_PASSWORD= # blank\n"
    )
    assert prepare(destination, tmp_path / "unused", SECRET_KEYS)
    content = destination.read_text()
    assert 'export MATCHA_SECRET="keep # this" # comment\n' in content
    assert "API_PORT=8001\n" in content
    assert "POSTGRES_PASSWORD=''" not in content
    assert "SEED_PASSWORD= # blank" not in content
    assert not prepare(destination, tmp_path / "unused", SECRET_KEYS)


def test_missing_secrets_are_added_and_invalid_quotes_leave_file_intact(tmp_path):
    destination = tmp_path / ".env"
    destination.write_text("API_PORT=8000\n")
    assert prepare(destination, tmp_path / "unused", SECRET_KEYS)
    assert all(f"{key}=" in destination.read_text() for key in SECRET_KEYS)

    content = 'MATCHA_SECRET="unfinished\n'
    destination.write_text(content)
    with pytest.raises(RuntimeError, match="Check the quoting for MATCHA_SECRET"):
        prepare(destination, tmp_path / "unused", SECRET_KEYS)
    assert destination.read_text() == content
    assert not list(tmp_path.glob(".matcha-env-*"))
