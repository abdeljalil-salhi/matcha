# Matcha

Matcha is a dating app built for the 42 web curriculum. This repository contains
a Flask backend and a React/TypeScript frontend. The frontend consumes the
documented HTTP API for account, profile, discovery, and messaging flows.

Start the full project from a fresh clone with Docker Compose v2 and Make:

```sh
make
```

`make up` and `make dev` do the same thing. Docker installs Python and Node
dependencies, creates missing local environment files with random development
secrets, applies database migrations, and starts all services. No Python, Node,
npm, or virtual environment is required on the host. The first run downloads
images and dependencies; subsequent runs reuse Docker's build cache.

Open [Matcha](http://localhost:5173), [API docs](http://localhost:8000/docs), or
[Mailpit](http://localhost:8025). For LAN/Wi‑Fi on other devices, run `make up-lan`
(uses `.env.lan`; see [Local network access](docs/SETUP.md#local-network-access-lan--wi-fi)).
Use `make seed` for optional demo profiles and `make down` to stop the stack.

Run `make help` for commands or see the
[development guide](docs/DEVELOPMENT.md).

## Features

- Email verification, password recovery, and cookie-based sessions
- Optional Google sign-in (OAuth 2.0/OIDC with PKCE) using the same session
- Editable profiles with photos, interest tags, and consent-based location
- Optional local photo enhancement combining mild deblurring and adaptive local contrast, with adjustable strength and before/after preview
- Profile suggestions and search by distance, interests, age, and fame
- Mutual likes, blocking, reporting, chat, and unread notifications
- One-to-one audio/video calls for connected members, with optional TURN relay

## Stack

Python 3.12 and Flask serve the API. PostgreSQL stores application data using
handwritten SQL. Docker Compose runs the local services, including Mailpit for
testing account emails.

## Documentation

| Guide | Start here to |
| --- | --- |
| [Local setup](docs/SETUP.md) | Start the full app, seed demo profiles, and use Swagger UI |
| [Frontend API contract](docs/API.md) | Connect a frontend and implement account, profile, discovery, and chat flows |
| [Audio/video calling](docs/CALLS.md) | Configure calls, TURN relay, and real-network verification |
| [Development and CI](docs/DEVELOPMENT.md) | Run tests, format Python, and understand the automated checks |
| [UI examples](docs/EXAMPLES.md) | See screenshots of location search, saved profile, map, gallery and discovery |

## Repository layout

- [`frontend/`](frontend/) contains the React application and its setup guide.
- [`server/`](server/) contains the Flask backend and its OpenAPI specification.
- [`sql/`](sql/) contains the PostgreSQL migrations.
- [`tests/`](tests/) contains integration tests and a Compose smoke test.
- [`docs/`](docs/) contains setup and integration guides.

## Contributing

Follow the [development guide](docs/DEVELOPMENT.md) before opening a pull
request. Update the [API contract](docs/API.md) and [OpenAPI specification](server/docs/openapi.json)
when changing an endpoint's behavior or response shape.
