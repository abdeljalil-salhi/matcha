# Development and CI

The standard development workflow requires only Docker with Compose v2 and Make
on the host. Run commands from the repository root. Python, Node, npm, formatting,
and test dependencies run inside containers.

## Start and develop

```sh
make                 # Generate missing env files, build, migrate, and start everything
make up              # Same as make
make dev             # Same as make, with frontend hot reload
make up-local        # Localhost-only stack using .env
make up-lan          # LAN/Wi-Fi stack using .env.lan
make seed            # Optional: populate 500 demo profiles
make logs SERVICES='frontend api worker'
make down            # Stop services, keeping the development database
```

The app is at `http://localhost:5173`, API at `http://localhost:8000/api`, and
Mailpit at `http://localhost:8025`. Startup waits for the API and frontend proxy
to become healthy. Services run in the background; use `make logs` to follow them.

`make env` creates missing `.env` files and fills blank or missing development
secrets using a Python container. Existing values are preserved. Never commit
these files. First startup downloads images and installs dependencies inside
Docker. `make install` builds the images separately if desired.

Frontend source, public assets, HTML, and Vite configuration are mounted for hot
reload. Dependencies stay in the image. After changing package manifests,
lockfiles, or backend code, run `make up` to rebuild and recreate changed services.
`make restart` recreates services after environment changes without rebuilding.

Set `FRONTEND_PORT`, `API_PORT`, or `MAILPIT_PORT` in `.env` to change host ports.
When changing the frontend port, update `FRONTEND_URL` to its exact browser origin.
The frontend uses `/api`, which Vite proxies to `api:8000` inside Docker; browser
requests do not require a Docker hostname or a separate API port setting.
Stop any existing host Vite server before starting Docker on the same port.

For LAN/Wi‑Fi testing, copy `.env.lan.example` to `.env.lan`, fill in your LAN
IP/hostname and secrets, then run `make up-lan`. Camera/mic calls still need
HTTPS or localhost on the device browser (see [SETUP.md](SETUP.md#https-for-lan-recommended-for-calls)).

Compose commands honor local overrides and project settings. Keep the same
configuration for an existing database volume. `COMPOSE` and `DOCKER` can override
the command names. `make ps`, `make health`, `make shell`, and `make db-shell`
inspect services. Run `make help` to list all commands.

## Checks inside Docker

```sh
make format          # Black
make lint            # Black check and Flake8
make backend-test    # Pytest with an isolated PostgreSQL container
make frontend-test   # Vitest
make frontend-build  # TypeScript checks and production build
make smoke           # Isolated full-stack startup, email, login, and frontend proxy
make check           # Lint, both test suites, and frontend build
```

Optional developer tools are built only when requested. Backend tests use a
unique Compose project and an ephemeral PostgreSQL database, explicitly excluding
local Compose overrides. Cleanup removes only that test project's containers and
volumes. Each integration test also uses its own schema. Select tests with:

```sh
make backend-test PYTEST_ARGS='-q tests/test_geocoder_processes.py'
```

Set `MATCHA_TEST_DSN` to use an existing disposable database reachable from the
tools container instead. It must allow schema creation.

`make smoke` runs a Docker CLI tools container with the host Docker socket mounted.
It creates a separate stack with dynamic host ports and a fresh database volume,
checks account verification and sign-in through Mailpit, then checks the frontend
and its API proxy. It removes the temporary stack on exit. It never loads local
Compose overrides or attaches the development database volume.

## GitHub Actions

- [Backend checks](../.github/workflows/backend.yml) run Black, Flake8, and the
  integration suite against PostgreSQL 17, along with a separate Compose smoke
  job. They run on pull requests and pushes to `main`.
- [CodeQL](../.github/workflows/codeql.yml) scans the Python backend on pushes to
  `main` and pull requests targeting it. Results appear under
  **Security → Code scanning** on GitHub.
- [Frontend checks](../.github/workflows/frontend.yml) run component regression
  tests and the production build on pull requests and pushes to `main`.
