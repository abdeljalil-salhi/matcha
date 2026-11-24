# Local setup

Run these commands from the repository root. You need Docker with Compose v2.

## Start the full app

```sh
make
```

`make up` and `make dev` are equivalent. No Python or Node installation is needed
on the host: Docker installs dependencies and runs the frontend, API, PostgreSQL,
and mail services. The first run downloads images and dependencies.

Startup creates missing `.env` files and generates independent development secrets
for `POSTGRES_PASSWORD`, `MATCHA_SECRET`, and `SEED_PASSWORD`. Existing settings
are preserved. `.env`/`.env.example` are localhost-only defaults; `.env.lan`/`.env.lan.example`
are for LAN/Wi‑Fi access. Compose applies migrations before starting the API and
waits for API/frontend readiness. Demo profiles are optional: run `make seed`.

Use `make logs`, `make ps`, or `make health` to inspect the stack. `make down`
stops services while preserving the database. Run `make up` after code or dependency
changes, and `make restart` after editing environment settings.

`FRONTEND_URL` must match the exact frontend browser origin (by default
`http://localhost:5173`). If changing `FRONTEND_PORT`, update that origin too.
`API_PORT` changes the published API/docs port; the frontend's internal proxy
continues to use the backend container on port 8000. For LAN/Wi‑Fi access, also
set `ALLOWED_ORIGINS` to extra browser origins you will use (comma-separated).

## Local URLs

| Service | Default URL |
| --- | --- |
| Frontend | [http://localhost:5173](http://localhost:5173) |
| API base URL | `http://localhost:8000/api` |
| API health | [http://localhost:8000/api/health](http://localhost:8000/api/health) |
| Swagger UI | [http://localhost:8000/docs](http://localhost:8000/docs) |
| OpenAPI JSON | [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json) |
| Mailpit | [http://localhost:8025](http://localhost:8025) |

`MAILPIT_PORT` can override the Mailpit port. In Swagger UI, use **Try it out**
on `POST /auth/login` with a verified account. The browser sends the session
cookie on later requests from the same page.

## Enable Google sign-in (bonus)

Google sign-in is optional and off until all three settings are present.

1. In Google Cloud Console, configure the OAuth consent screen and create an
   **OAuth client ID** of type **Web application**.
2. Add `http://localhost:8000/api/auth/google/callback` as an authorized
   redirect URI for local development. Use the exact API origin and path; add a
   separate URI for each deployed environment.
3. Set the credentials in `.env`:

   ```sh
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
   ```

4. Recreate the containers so they pick up the new values:
   `docker compose up -d --force-recreate`. Migration `015_google_auth.sql`
   creates the account-link table automatically.

The “Continue with Google” button appears on the login and registration pages
only when the API reports the strategy as configured. Sign-in requires a Google
account with a verified email address. It links to an existing Matcha account
with that address only after the local email has been verified; an unverified
local account must use its verification link first. A Google identity cannot be
linked to an account already linked to a different Google identity. The flow
uses authorization code + PKCE and ends in the same HttpOnly session cookie as
password login, so one-click sign-out and session revocation continue to work.

## Create test users

Populate the database with 500 fictional profiles for discovery.

```sh
make seed
```

To sign in as `demo_001` or `demo_002`, use the generated `SEED_PASSWORD` from
`.env`, or set your own value before running `make seed`.

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
message in Mailpit. Follow the verification link in the email to verify the account in the frontend.

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

## Local network access (LAN / Wi‑Fi)

Use the dedicated LAN env file to avoid mixing localhost and LAN settings:

1. Copy the template: `cp .env.lan.example .env.lan`
2. Set your LAN IP/hostname and secrets in `.env.lan`. For camera/mic calls on other devices, prefer HTTPS + a hostname Google accepts (e.g. `192.168.1.55.sslip.io`) and configure `TLS_CERT_FILE`/`TLS_KEY_FILE` (see below).
3. Start the LAN stack:
   ```sh
   make up-lan
   ```
4. Open the `FRONTEND_URL` from `.env.lan` on another device on the same Wi‑Fi.

`make up-local` (or `make up`) uses `.env` for localhost-only HTTP. Keep `VITE_API_URL=/api` (Docker default) so the browser talks same-origin through the Vite proxy. Do not expose these dev ports to untrusted networks.

### Audio/video calls over LAN

WebRTC signaling already works over HTTP polling. For media:

- **Same LAN/Wi‑Fi**: TURN is usually **not required**. Blank `CALL_STUN_URLS`/`CALL_TURN_URLS` are fine when browsers can make a direct peer connection.
- **Browser secure context required**: camera/microphone access requires **HTTPS or localhost**. A plain `http://192.168.x.x:5173` page is usually not a secure context on phones/laptops, so `getUserMedia` will fail even though the call UI loads. For real camera/mic calls across LAN devices, serve Matcha over HTTPS (trusted local cert/reverse proxy) or use a secure tunnel. This is a browser security constraint, not a TURN issue.
- **Different networks/NAT**: configure a reachable TURN server (`CALL_STUN_URLS`, `CALL_TURN_URLS`, `CALL_TURN_SECRET`, optionally `CALL_RELAY_ONLY=true`) as documented in [CALLS.md](CALLS.md). The bundled `compose.turn.yaml` is for public relay hosts; its coturn config denies private/loopback peers and is not intended for internal-network relay testing.

## HTTPS for LAN (recommended for calls)

Use HTTPS so other devices get a secure context for camera/microphone. The easiest dev path is `mkcert`.

1. Install [mkcert](https://github.com/FiloSottile/mkcert) and trust its local CA on your dev machine:
   ```sh
   mkcert -install
   ```
2. Generate a cert that includes your LAN IP/hostname:
   ```sh
   cd infra/certs
   mkcert 192.168.1.55 localhost 127.0.0.1 ::1
   mv 192.168.1.55+3.pem dev.crt
   mv 192.168.1.55+3-key.pem dev.key
   cd ../..
   ```
3. In `.env.lan`, point Vite at the cert and switch the browser origin to HTTPS:
   ```ini
   FRONTEND_URL=https://192.168.1.55.sslip.io:5173
   ALLOWED_ORIGINS=https://192.168.1.55.sslip.io:5173,https://192.168.1.55:5173,http://localhost:5173
   COOKIE_SECURE=true
   TLS_CERT_FILE=/app/infra/certs/dev.crt
   TLS_KEY_FILE=/app/infra/certs/dev.key
   ```
4. Recreate services:
   ```sh
   make up-lan
   ```
5. Trust the cert on other devices. The simplest way is to install mkcert's local CA (`mkcert -CAROOT` shows it) on the phone/laptop you test with. Without trust, browsers will show a certificate warning and some features may still be blocked.

Notes:
- Vite serves the frontend over HTTPS; it proxies `/api` to the internal HTTP API container. Browser traffic stays same-origin HTTPS.
- If you use a different port/hostname, include it in the mkcert command and in `FRONTEND_URL`/`ALLOWED_ORIGINS`.
- For a more production-like setup, put Nginx/Caddy/Traefik in front with TLS and proxy to frontend/API; the same `FRONTEND_URL=https://...` and `COOKIE_SECURE=true` rules apply.

## Stop the stack

```sh
docker compose down
```

The PostgreSQL volume persists between runs. Continue with the
[frontend API contract](API.md) to wire up browser requests and email links.

If device location finds a city without a neighborhood, confirm the offered city to save it as a manual approximate location, or cancel and enter another place. The city suggestion alone does not change your saved location.


The `/map` page displays opted-in compatible members. Migration `013_user_map.sql` leaves real accounts hidden and enables the existing fictional demo fixtures for evaluation. No database reset or reseed is needed. New demo fixtures are map-visible; seed reruns preserve an existing fixture's explicit map choice. Real users can enable or disable approximate area sharing from “Your map visibility”. The separate device GPS button centers only their own browser view.

Audio/video calls use native WebRTC and migration `014_calls.sql`. See [CALLS.md](CALLS.md) for optional TURN configuration and the manual real-network verification checklist. No camera or microphone is accessed by the automated tests.
