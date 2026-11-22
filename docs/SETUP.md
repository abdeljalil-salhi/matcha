# Local setup

Run these commands from the repository root. You need Docker with Compose v2.

## Start the backend

1. Copy `.env.example` to `.env`.

   ```sh
   cp .env.example .env
   ```

2. Set `POSTGRES_PASSWORD` and `MATCHA_SECRET` in `.env`. Generate each value
   independently with `openssl rand -hex 32`. Keep `.env` local.
3. Set `FRONTEND_URL` to your frontend's exact origin. The default is
   `http://localhost:5173`. Use `localhost` for both services during local browser
   development so they share a site.
4. Start the stack and check the API.

   ```sh
   docker compose up --build -d
   curl --fail --retry 10 --retry-connrefused http://localhost:8000/api/health
   ```

Compose runs PostgreSQL, applies migrations, then starts the API and email
worker. A successful health check returns `{"status":"ok"}`. If port 8000 is in
use, set `API_PORT` in `.env` and use that port for the health check and Swagger.
The current migration series expects a fresh database. For a volume from the
original two-file schema, use a new Compose project name to start with a separate
volume. Stop the previous stack first if it uses the same ports.

## Local URLs

| Service | Default URL |
| --- | --- |
| API base URL | `http://localhost:8000/api` |
| API health | [http://localhost:8000/api/health](http://localhost:8000/api/health) |
| Swagger UI | [http://localhost:8000/docs](http://localhost:8000/docs) |
| OpenAPI JSON | [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json) |
| Mailpit | [http://localhost:8025](http://localhost:8025) |

`MAILPIT_PORT` can override the Mailpit port. In Swagger UI, use **Try it out**
on `POST /auth/login` with a verified account. The browser sends the session
cookie on later requests from the same page.

## Create test users

Populate the database with 500 fictional profiles for discovery.

```sh
docker compose run --rm setup python -m server.manage seed
```

To enable sign-in for `demo_001` and `demo_002`, choose a `SEED_PASSWORD` in
`.env` before running the seed command. Use that password with either username.

Demo profiles have realistic fictional names, interest-based biographies, and
bundled AI-generated adult portraits. They retain `demo_NNN` usernames so test
accounts remain recognizable. The 219 distinct portraits are reused across the
500 accounts; seeding and photo serving need no external image service.
Portrait source and license are recorded in
[`server/jobs/assets/portraits/SOURCE.md`](../server/jobs/assets/portraits/SOURCE.md).

Rerun the same seed command to upgrade the original numbered names, biographies,
and silhouette avatars. Only fields still matching their original placeholders
are replaced; edited profile fields and uploaded photos are preserved. Existing
locations, interests, likes, and visits remain intact. As before, reseeding rotates
the evaluator passwords and revokes their sessions, so sign in again afterwards.

To test registration and email verification, register an account and open the
message in Mailpit. While the frontend verification page is still being built,
copy the value after `#token=` from the email link and submit it to
`POST /auth/verify` in Swagger UI.

Manual location and consent-based GPS have offline examples in Paris, Lyon,
Marseille, Rabat, Casablanca, and London. For broader coverage, set
`GEOCODER_URL` to a Nominatim-compatible instance with `/search` and `/reverse`
endpoints.

Device location is saved as `gps` only after explicit consent and successful
neighborhood resolution. Nearby offline neighborhoods are supported within 1 km;
other areas need the configured reverse geocoder. City-only or failed GPS lookups
leave the saved location unchanged. The user can enter a city or neighborhood
manually instead. Coordinates are rounded for storage after the lookup.

Online geocoding uses a PostgreSQL-backed cache and provider lock shared by all
backend workers using the same database. Only one external call runs at a time,
with a one-second cooldown after every attempt, including failures. Requests
that exceed the database lock wait receive HTTP 503 with `Retry-After`.

Successful place results are cached for 24 hours; not-found results for five
minutes. Cache hits skip the provider queue. Expired entries are removed by the
worker's cleanup job. Cache keys hash the provider and request parameters, and
cached data contains only city, neighborhood, country, and rounded coordinates.
Raw search text, precise input coordinates, and account IDs are not stored there.
Changing `GEOCODER_URL` selects a separate cache namespace.

For the public Nominatim service, read its
[usage policy](https://operations.osmfoundation.org/policies/nominatim/).
Use an identifying `GEOCODER_USER_AGENT`, retain visible attribution, and avoid
submitting personal or confidential information. Autocomplete stays local;
external calls happen only when a user saves a location. A self-hosted provider
is preferable for real users' GPS data. The location form and map credit
[OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

## Stop the stack

```sh
docker compose down
```

The PostgreSQL volume persists between runs. Continue with the
[frontend API contract](API.md) to wire up browser requests and email links.

If device location finds a city without a neighborhood, confirm the offered city to save it as a manual approximate location, or cancel and enter another place. The city suggestion alone does not change your saved location.
