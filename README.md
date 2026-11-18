# Matcha backend

Flask API and PostgreSQL for the 42 Matcha assignment.

## Run locally

Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD` and `MATCHA_SECRET`. Generate each independently with `openssl rand -hex 32`. Set `SEED_PASSWORD` if you want to sign in to the two evaluator accounts, `demo_001` and `demo_002`.

```sh
docker compose up --build -d
docker compose run --rm setup python -m server.manage seed
curl http://localhost:8000/api/health # Use the API_PORT from .env if different
```

The API defaults to port 8000. Set `API_PORT` in `.env` to use another port. The local email inbox listens on port 8025. The frontend origin defaults to `http://localhost:5173`. Compose applies the numbered feature migrations before starting the API and SMTP worker. The current migration series expects a fresh database. If you have a volume from the original two-file schema, use a new Compose project name to create a separate volume, stopping the previous stack first if it uses the same ports. Manual location and GPS have offline examples in Paris, Lyon, Marseille, Rabat, Casablanca, and London. For broader coverage, set `GEOCODER_URL` to a Nominatim-compatible instance with `/search` and `/reverse` endpoints.

## Frontend integration

Use credentialed fetches, render user-generated content as text, and load the session with `GET /api/me`. The frontend handles `/account/verify`, `/account/reset`, and `/account/email` by reading `token` from the URL fragment and submitting it to the relevant API endpoint. Record a profile visit with `POST /api/profiles/{id}/visits` after loading the profile detail. Poll `GET /api/notifications` globally and `GET /api/chat/{id}/messages?after={lastId}` in an open chat every 2 seconds while the app is active. The local `.idea/` notes in the authoring workspace contain the complete route contract and design rationale.

## Integration tests

With Python 3.12, install `requirements-dev.txt` in a virtual environment, then run `MATCHA_TEST_DSN='<disposable PostgreSQL DSN>' python -m pytest -q`. Tests create and remove a dedicated schema. The DB role needs permission to create schemas in that database.

## Python formatting

With a Python 3.12 virtual environment active, install the development tools and the Git hook once per checkout.

```sh
python -m pip install -r requirements-dev.txt
pre-commit install --install-hooks
```

On commit, Black formats staged Python files first and Flake8 checks them. If Black edits a file, review and re-stage it before retrying the commit. To format or check the full Python tree manually:

```sh
black server tests
black --check server tests
flake8 server tests
```

## Interactive API docs

Open `/docs` on the backend origin, for example `http://localhost:8000/docs`.
Swagger UI shows endpoint parameters, request bodies, and responses. Use
**Try it out** on `POST /auth/login` with a verified account. The browser will
send the session cookie on later requests from the same page. Use the same
hostname throughout. The raw OpenAPI document is available at `/openapi.json`.
