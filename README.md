# Matcha

Matcha is a dating app built for the 42 web curriculum. This repository contains
a Flask backend and a React/TypeScript frontend. The frontend consumes the
documented HTTP API for account, profile, discovery, and messaging flows.

To run the frontend locally, keep `FRONTEND_URL=http://localhost:5173` in `.env`,
start the backend with `docker compose up -d`, then follow
[frontend/README.md](frontend/README.md).

Run `make help` for development shortcuts, or see the
[development guide](docs/DEVELOPMENT.md) for installation and testing commands.

## Features

- Email verification, password recovery, and cookie-based sessions
- Optional Google sign-in (OAuth 2.0/OIDC with PKCE) using the same session
- Editable profiles with photos, interest tags, and consent-based location
- Profile suggestions and search by distance, interests, age, and fame
- Mutual likes, blocking, reporting, chat, and unread notifications

## Stack

Python 3.12 and Flask serve the API. PostgreSQL stores application data using
handwritten SQL. Docker Compose runs the local services, including Mailpit for
testing account emails.

## Documentation

| Guide | Start here to |
| --- | --- |
| [Local setup](docs/SETUP.md) | Start the backend, seed demo profiles, and use Swagger UI |
| [Frontend API contract](docs/API.md) | Connect a frontend and implement account, profile, discovery, and chat flows |
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
