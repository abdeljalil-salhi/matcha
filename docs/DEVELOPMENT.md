# Development and CI

Run commands from the repository root with Python 3.12. Make targets use `.venv`
directly; activate it when running the manual Python commands below.

## Makefile shortcuts

Run `make` or `make help` to list all commands. Common workflows are:

```sh
make env             # Copy missing .env templates; keep existing settings
make install         # Install Python/Node dependencies and Git hooks
make dev             # Start Docker, then run the frontend in the foreground
make seed            # Apply migrations and populate demo profiles
make check           # Lint, run both test suites, and build the frontend
make down            # Stop Docker services while keeping database volumes
```

Fill the required secrets in `.env` before starting the stack. Use Python 3.12,
Node.js 24, and Docker Compose v2. `make frontend` runs the frontend on its own;
`make up` builds and starts only the backend stack. Stop the foreground Vite
server with Ctrl+C; Docker services continue until `make down`.

`make backend-test` starts a disposable PostgreSQL container on a dynamically
assigned loopback port and removes it on success or failure. If you set
`MATCHA_TEST_DSN`, that connection is used instead. To select tests:

```sh
make backend-test PYTEST_ARGS='-q tests/test_geocoder_processes.py'
```

`make format`, `make lint`, `make frontend-test`, `make frontend-build`, and
`make smoke` run the individual checks. `make logs SERVICES='api worker'`,
`make ps`, and `make health` help inspect the running backend. `make shell` and
`make db-shell` open interactive container shells.

Compose commands honor `COMPOSE_FILE`, `COMPOSE_PROJECT_NAME`, and `.env` port
settings. Keep using the same Compose overrides for an existing database volume.
You can also override `COMPOSE`, `DOCKER`, `NPM`, `PYTHON`, or `PYTHON_BOOTSTRAP`.
`make restart` recreates services so changed environment settings take effect;
use `make up` after changing backend code. No target removes development volumes.

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
