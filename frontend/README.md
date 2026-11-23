# Matcha frontend

A React + TypeScript single-page app for the Matcha API. It is built with Vite and
expects the Flask backend from this repository.

## Run locally

From the repository root, run `make`, `make up`, or `make dev`. Docker installs
all dependencies and starts Vite alongside the API, database, and email worker.
Open <http://localhost:5173>. No Node or npm installation is needed on the host.

Source changes hot reload through read-only bind mounts; dependencies live in the
image. Run `make up` again after changing `package.json` or `package-lock.json`.
Use `make frontend-test` for regression tests and `make frontend-build` for a
type-checked production build, both inside Docker.

Docker sets `VITE_API_URL=/api`; Vite proxies requests to the backend container
at `api:8000`. `frontend/.env` is generated for optional host development and is
excluded from the image. Keep `FRONTEND_URL` in the root `.env` set to the exact
frontend browser origin for sessions, CORS, and email links.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Public landing page |
| `/login`, `/register`, `/forgot-password`, `/check-email` | Account flows |
| `/account/verify`, `/account/reset`, `/account/email` | Links from email (token in URL fragment) |
| `/onboarding` | Required first-time profile setup |
| `/discover`, `/search` | Ranked suggestions and advanced search |
| `/profile/me` | Edit your profile, photos, and location |
| `/profile/:id` | Public profile with like, block, and report |
| `/likes`, `/visitors`, `/blocks` | Relationships and safety |
| `/chat`, `/chat/:id` | Conversations with connected members |
| `/notifications`, `/settings` | Inbox and account settings |

## How it talks to the backend

- Every request uses `credentials: "include"`; the session lives in the
  `matcha_session` cookie. JSON requests set `Content-Type: application/json`,
  photo uploads use `FormData`, and bodyless POST/PUT/DELETE requests send no
  content type.
- `GET /api/me` runs on startup. A 401 shows the sign-in flow; `complete`
  drives the onboarding gate.
- Notifications are polled every two seconds for the signed-in session, with
  unread counts and direct sign-out controls on app and standalone pages.
  Presence refreshes only while visible. The active chat thread polls from zero
  for an empty conversation, then every two seconds from the
  latest message ID, loads history with `before`, and reconciles by server ID
  and client-generated UUID.
- Text from the API is rendered as text, never as HTML. Photos use
  `GET /api/photos/:id`, so no credentials or secrets are embedded in the URL.

## Structure

```
src/
  api/          typed request client and endpoint definitions
  components/   layout, UI primitives, profile and discovery widgets
  context/      auth, notification polling, toasts
  pages/        one module per route
  styles/       design tokens, shared components, page styles
  utils/        formatting and validation helpers
```
