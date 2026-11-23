# Frontend API contract

All paths below start with `/api`. Send JSON with `Content-Type: application/json` except for images. Browser requests need `credentials: "include"`; the frontend origin must exactly match `FRONTEND_URL`. Dates and times are ISO 8601. IDs in normal responses are integers. Errors use `{"error":{"message":"..."}}`. A 204 has no response body.

## Connect from the frontend

Start with the [local setup guide](SETUP.md). The default API base URL is
`http://localhost:8000/api`. Use that same backend origin to open Swagger UI
at `/docs` or fetch its specification at `/openapi.json`.

Load the current session on app startup:

```js
const response = await fetch("http://localhost:8000/api/me", {
  credentials: "include",
});
```

A 200 means the session is active. Use the profile's `complete` field to decide
whether to show onboarding. A 401 means the user needs to sign in. The browser
stores the session cookie after login. For photo uploads, send `FormData` with
the `photo` field and let the browser set the multipart header.

## Accounts

| Method and path | Request | Success |
| --- | --- | --- |
| GET `/health` | None | 200 with `status` |
| POST `/auth/register` | `username, email, first_name, last_name, password` | 201, mail queued |
| POST `/auth/resend-verification` | `email` | 202 |
| POST `/auth/verify` | `token` | 204 |
| POST `/auth/login` | `username, password` | 200, user ID and username, session cookie |
| POST `/auth/logout` | None | 204, cookie cleared |
| POST `/auth/forgot-password` | `email` | 202 |
| POST `/auth/reset-password` | `token, password` | 204, all prior sessions revoked |
| POST `/me/email-change` | `email, password` | 202, confirmation sent to new email |
| POST `/auth/confirm-email` | `token` | 204 |

For links in email, the frontend receives routes `/account/verify`, `/account/reset`, and `/account/email`. Read `token` from the fragment using `new URLSearchParams(location.hash.slice(1))`, remove it from the address bar, then submit to the corresponding endpoint. The reset page prompts for the new password. A 401 indicates invalid credentials or an expired session. A 403 from login can mean the email is unverified. A 409 on registration indicates a duplicate identifier. A 429 means a rate limit was hit.

## Profile and discovery

| Method and path | Request | Success |
| --- | --- | --- |
| GET `/me` | None | 200, own fields, email, location metadata, tags, photos and completeness |
| PATCH `/me` | Any of `first_name, last_name, birth_date, gender, seeks, bio, tags` | 204 |
| GET `/tags?q=art` | Optional tag prefix | 200, `tags` |
| PUT `/me/location` | Manual or GPS payload below | 200, resolved place |
| DELETE `/me/location` | None | 204 |
| POST `/me/photos` | Multipart field `photo` | 201, ID and primary status |
| PUT `/me/photos/{id}/primary` | None | 204 |
| DELETE `/me/photos/{id}` | None | 204 |
| GET `/photos/{id}` | None | 200, JPEG |
| GET `/profiles/{id}` | None | 200, eligible profile, photos, `likes_you`, `likes_them`, `connected`, `online` and `last_seen` |
| POST `/profiles/{id}/visits` | None | 204 |
| GET `/discovery/suggestions` | Filters below | 200, `profiles` |
| GET `/discovery/search` | Filters below | 200, `profiles` |

Dates of birth use `YYYY-MM-DD`. `gender` is `woman`, `man`, `nonbinary`, or `other`. `seeks` is an array of one or more accepted genders, or null for the default. `tags` is an array of at most 15 strings. Tags accept an optional leading hash and are normalized and deduplicated. Names allow up to 80 characters, the biography up to 1,500. The API expects plain text. Render text fields with normal framework escaping or DOM `textContent`.

Manual location sends `{"source":"manual","query":"Montmartre, Paris"}`. GPS sends `{"source":"gps","latitude":48.8867,"longitude":2.3431,"consent":true}` after browser permission and explicit user consent. Preserve coordinate precision for the consented neighborhood lookup; the server rounds stored coordinates to two decimals. If GPS permission is denied or no city can be resolved, offer the manual field. Removing a location disables discovery until a new one is saved. Suggestions additionally require a complete profile.

When GPS finds a city without a neighborhood, the server returns **409**, with `error.code` equal to `city_confirmation_required` and `city_suggestion` containing `city`, `country_code`, and `confirmation_token`. No location fields change. Show the city and ask the user to confirm it as their approximate location; never automatically resubmit it. On confirmation, send `{"source":"manual","confirmation_token":"<returned token>"}` to the same endpoint. On cancellation, make no request. The token is bound to the account and expires after ten minutes; an invalid or expired token returns 422. Successful confirmation stores `location_source: "manual"` and `area: null`, without another provider lookup.

Both discovery routes support `min_age`, `max_age`, `min_fame`, `max_fame`, `max_distance_km`, `min_common_tags`, `location`, repeated `tag`, `sort`, `direction`, `limit` and `offset`. Use sorts `recommended`, `age`, `location`, `fame`, or `common_tags`. Explicit sorts accept `asc` or `desc`. Location uses distance for sorting and human-readable place labels for filtering. Repeated tags all need to match. Pagination defaults to 25, with a 100 record maximum per page. Advance the offset by the page size and stop when a page returns fewer results.

The public profile response includes first and last name, username, age, gender and preference, bio, tags, city and neighborhood, relative presence, fame, and public photo references. It omits email, password, exact birth date and coordinates. Render photos with the API URL in an image element on a same-site frontend. Call the visit POST after profile detail opens, excluding self views. A 404 can indicate a blocked, unavailable or incomplete profile. Photo management can return 409 for the five-photo cap and 422 for rejected formats or invalid images.

## Relationships, chat and notifications

| Method and path | Request | Success |
| --- | --- | --- |
| PUT `/profiles/{id}/like` | None | 200, `connected` |
| DELETE `/profiles/{id}/like` | None | 204 |
| PUT `/profiles/{id}/report` | None | 204 |
| PUT or DELETE `/profiles/{id}/block` | None | 204 |
| GET `/me/blocks` | Optional `limit, offset` | 200, `blocks` |
| GET `/me/visitors` | Optional `limit, offset` | 200, `visitors` |
| GET `/me/likes` | Optional `limit, offset` | 200, `likes` |
| GET `/chat` | Optional `limit, offset` | 200, `conversations` |
| GET `/chat/{id}/messages` | Optional `before` or `after`, `limit` | 200, `messages` oldest to newest |
| POST `/chat/{id}/messages` | `body, client_id` | 201 for new message, 200 for same UUID and body |
| GET `/notifications` | Optional `before, limit` | 200, latest notifications and `unread.total`, `unread.messages` |
| PUT `/notifications/{id}/read` | None | 204 |
| PUT `/notifications/read` | `through` set to latest visible notification ID to mark | 204 |
| POST `/presence` | None | 204 |

Keep the notification poll at app-shell scope, every two seconds while the app is active. Derive the global badge from unread counts and deduplicate feed items by ID. Unread message notifications contribute to both counts. Opening a conversation leaves inbox state untouched until the client explicitly marks the corresponding items read. The notification inbox is newest first. For history pass the smallest visible ID as exclusive `before` and merge older items. Use a local notification snapshot and its highest visible ID for mark-through so newer arrivals remain unread.

Load a chat with no cursor to get the newest page. Use `before` for history and `after` for new messages. Start polling from the latest loaded ID every two seconds, and immediately page forward again if a response fills the requested limit. Use the same client-generated UUID on delivery retries, and reconcile response and poll results by server message ID. A 403 means chat access has changed. Close the active conversation and refresh its relationship and the global inbox. A 401 indicates authentication has ended. Refresh notifications and the active thread promptly on tab focus or network recovery. While the global poll is active it also updates presence, so a second heartbeat is unnecessary. Conversation summaries include `online`, based on an unexpired session active within 15 seconds; the chat list refreshes every four seconds and updates avatar indicators in the list and active thread.

The UI should expose sign-out on every page, hide or disable chat for profiles without a current connection, and disable new likes while the signed-in user's profile has no primary photo. These checks are also enforced by the API.

Photo uploads accept one JPEG, PNG, or WebP file up to **10 MiB (10,485,760 bytes)** and 16 megapixels, with at most five photos per profile. The HTTP request has an additional 16 KiB allowance for multipart headers and boundaries; this does not increase the per-file limit. Oversized uploads return HTTP 413.

Notifications are grouped by actor and type in `GET /notifications`, before pagination. Each row uses the latest event's `id`, `message_id`, and timestamp and includes `unread_count`. A row has `read_at: null` while any represented event is unread. Read activity remains one compact row per actor/type. `unread.total` counts unread groups; `unread.messages` counts individual unread messages. Use a message group's `unread_count` for conversation badges.

Merge paginated rows by `(kind, actor_id)`, retaining the highest event ID, so polling and older pages cannot duplicate or regress a group. Show unread message counts and repeated visit counts in notification text. Likes, visits, matches, messages and connection removals each retain their own group per actor.

Clicking a message notification opens its conversation without acknowledging it first. Once its latest message is displayed in the visible chat, `PUT /notifications/{id}/read` acknowledges that actor/type group's visible events through the supplied notification ID. Other notification clicks use the same grouped read endpoint. Events arriving after the supplied boundary remain unread. Mark-all-read retains its global inclusive ID boundary.

## Opt-in user map

- `GET /me/map` returns `{ "map_visible": false, "center": { "latitude": 48.86, "longitude": 2.35 } }`. The center is the caller's approximate saved location, or null if none is saved.
- `PUT /me/map` with `{ "map_visible": true, "consent": true }` explicitly shares the caller's approximate saved area. A complete profile is required. `{ "map_visible": false }` revokes sharing, including for incomplete accounts. Real accounts start hidden; matching-location consent does not enable map sharing.
- `GET /map/profiles?west=-180&east=180&south=-90&north=90&limit=100&after=0` lists public summaries and approximate points. The caller must have a complete profile. Both users' preferences and block rules apply; self, hidden and incomplete accounts are omitted. Bounds are required finite numbers; south must be less than north. west greater than east represents a dateline-crossing viewport.
- The response contains `profiles`, `has_more` and `next_after`. Continue with the same bounds and the returned exclusive ID cursor. Maximum page size is 100. The UI displays at most 1,000 people before requesting a narrower viewport.

Public coordinates are rounded to two decimal places (roughly a kilometre in latitude, varying by location). Viewport filtering uses those same public points, so narrow queries cannot recover hidden coordinate precision. No addresses, precise GPS history, email or private profile fields are exposed. Opted-in markers follow changes to the saved matching location; deleting that location also disables map sharing. Other clients refresh every 15 seconds, so revocation is reflected on their next refresh.

The device-location button centers only the current browser map using consented JavaScript GPS. It does not save the device position or enable sharing. Viewport request bounds are rounded outwards to the public grid; OpenStreetMap supplies the visible map tiles. Nearby profiles form numbered clusters: selecting a cluster smoothly zooms in without opening a card. At maximum zoom, profiles sharing a public point fan out into individual tappable markers; these display offsets do not imply more precise coordinates. Only selecting an individual marker opens its profile card on the map. Motion is reduced when the device requests it. Fictional demo profiles are visible on the map for evaluation; this does not opt real users in.
