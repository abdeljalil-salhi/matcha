# Development and CI

Run these commands from the repository root with Python 3.12 and an active
virtual environment.

## Install dependencies

```sh
python -m pip install -r requirements-dev.txt
pre-commit install --install-hooks
```

Black formats staged Python files before Flake8 checks them. If Black changes
a file, review and re-stage it, then retry the commit.

```sh
black server tests
black --check server tests
flake8 server tests
```

## Run integration tests

Set `MATCHA_TEST_DSN` to a disposable PostgreSQL connection string.

```sh
MATCHA_TEST_DSN='<disposable PostgreSQL DSN>' python -m pytest -q
```

The database role needs permission to create schemas. Each test creates and
removes its own schema and applies all migrations during setup, so accounts,
sessions, and notifications cannot leak between tests.

## Run the Compose smoke test

With Docker running:

```sh
python -m tests.compose_smoke
```

The smoke test uses a temporary Compose project, a fresh PostgreSQL volume, and
dynamically assigned ports. It checks API startup, verification email delivery
through Mailpit, and cookie-based sign-in. It removes the temporary containers
and volume on exit.

## Run frontend regression tests

Use Node.js 24 and the committed npm lockfile:

```sh
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
```

Vitest and React Testing Library cover empty-chat delivery, safe GPS failures,
session controls across routes, logout failures, and notification polling.
The production build also type-checks the frontend and test files.

## GitHub Actions

- [Backend checks](../.github/workflows/backend.yml) run Black, Flake8, and the
  integration suite against PostgreSQL 17, along with a separate Compose smoke
  job. They run on pull requests and pushes to `main`.
- [CodeQL](../.github/workflows/codeql.yml) scans the Python backend on pushes to
  `main` and pull requests targeting it. Results appear under
  **Security → Code scanning** on GitHub.
- [Frontend checks](../.github/workflows/frontend.yml) run component regression
  tests and the production build on pull requests and pushes to `main`.
