# Audio and video calls

Connected members can start a one-to-one audio or video call from the conversation header. The recipient receives an invitation anywhere in the signed-in app. Answer explicitly to share the microphone (and camera for video). Mute, camera toggle, minimize, and hang-up controls remain available while navigating. Matcha does not record calls.

## Architecture and limits

Native WebRTC carries the media, directly between browsers or through a TURN relay. Flask and PostgreSQL exchange setup messages over authenticated HTTP; no media passes through Flask. The global call provider checks for invitations every two seconds and polls a current call every second, including while hidden. Browsers may throttle background tabs or suspend mobile pages; a suspended owner can lose its lease.

Both users must have current mutual likes and no block. A user can participate in only one ringing or active call. Ordered user locks and unique participant slots prevent simultaneous invitations from creating multiple calls. Each accepted side is bound to its authenticated session and a fresh browser-instance UUID, so other tabs can see call state but cannot read signals or renew the media lease. Refreshing does not silently recapture devices; abandoned calls expire.

Invitations expire after 45 seconds; controlling browsers renew a 30-second lease every five seconds. Calls have a 30-minute server lifetime, enforced during polling and cleanup. Ending, declining, blocking/unliking, session revocation, or expiry releases busy slots and deletes all SDP/ICE signals. State polling and the mail worker perform cleanup. Terminal call metadata is retained for at most one day plus the cleanup interval. Signals are bounded to 64 KiB descriptions, 4 KiB candidates, and 512 packets per call; retries reuse UUIDs. Only the caller sends the initial offer and only the accepting browser sends the answer. No renegotiation or screen sharing is implemented.

Media capture starts only after Start or Answer. Local tracks and peer connections close on hang-up, failed setup, prolonged network loss, page exit, unmount, or sign-out. A late permission response after cancellation is stopped immediately. Network interruption can prevent delivery of hang-up; the other side then observes disconnection or lease expiry. Blocking revokes server signaling and the normal clients stop their media on the next poll; a server cannot forcibly close an independently modified direct peer connection.

## Running locally

Run the normal migration/setup and frontend commands. `014_calls.sql` adds call state, participant slots and signaling tables without changing existing messages.

Camera/microphone capture requires HTTPS or localhost. Two localhost browser sessions can test direct calling, using different accounts with mutual likes. Blank ICE settings are sufficient only when the browser/network can establish a direct connection; they do not establish cross-network reliability. The browser may require another click on **Play call audio** if autoplay is blocked.

## LAN / Wi‑Fi

For same-network devices, expose the dev stack and set the browser origin as described in [SETUP.md](SETUP.md#local-network-access-lan--wi-fi). Keep `VITE_API_URL=/api` so requests stay same-origin through the Vite proxy.

- **Calls on the same LAN** usually do not need TURN; direct WebRTC peer connections can work when the network allows them.
- **Camera/mic still require a secure context**. Opening `http://<lan-ip>:5173` from another device is not localhost; most browsers block `getUserMedia` on insecure origins. Use HTTPS (trusted local cert/reverse proxy) or a secure tunnel for real call testing on LAN devices.
- **TURN** is for NAT/firewall/cross-network traversal. The optional `compose.turn.yaml` relay is configured for public peers and denies private/loopback peer addresses, so it is not a drop-in fix for insecure-context LAN camera access.

## TURN for different networks

Use a reachable authenticated TURN server for cross-network use. The API supports coturn REST-style temporary credentials. Configure the following environment variables and recreate the API:

```ini
CALL_STUN_URLS=
CALL_TURN_URLS=turn:YOUR_RELAY_PUBLIC_IP:3478?transport=udp,turn:YOUR_RELAY_PUBLIC_IP:3478?transport=tcp
CALL_TURN_SECRET=
CALL_RELAY_ONLY=true
TURN_PUBLIC_IP=
```

Generate a random secret of at least 32 characters locally (`openssl rand -hex 32`), put it in `CALL_TURN_SECRET`, and configure the same secret on coturn. It stays server-side; the API returns expiring, per-user credentials valid for one hour. Do not put it in a `VITE_` variable. `CALL_RELAY_ONLY=true` forces media through TURN and avoids advertising direct media routes to the other peer. With `false`, a direct connection may expose network addresses to the connected peer.

An optional standalone relay configuration is provided:

```sh
docker compose -f compose.turn.yaml up -d
```

Run it on a public relay host with its actual public IPv4 in `TURN_PUBLIC_IP`. The browser must reach that host; a Docker service name is not a browser-reachable relay address. Forward TCP/UDP 3478 and UDP 49160–49180 unchanged if the host is behind NAT. The included relay denies private/loopback peer addresses, disables administrative access, and limits allocations; it is intended for public media peers, not internal-network relay testing. It does not attach to or modify the application's database volumes. Stop it with `docker compose -f compose.turn.yaml down`.

For production, serve the app over HTTPS and use a domain/certificate-backed `turns:` endpoint when network policy requires TURN over TLS. The optional file provides UDP/TCP TURN without TLS and is not a complete public hosting/TLS setup. TURN credentials are temporary, but bandwidth still needs operational monitoring and firewall limits.

Official references: [WebRTC signaling](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling), [media permissions](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [TURN deployment](https://webrtc.org/getting-started/turn-server), [coturn Docker](https://github.com/coturn/coturn/blob/master/docker/coturn/README.md).

## Verification

Automated coverage uses disposable PostgreSQL schemas and mocked media devices/peer connections. It checks call authorization and roles, retries, busy races, ownership, expiry, revocation, TURN credentials, offer/answer/ICE ordering, disconnect recovery, permission denial/cancellation, mute/camera state and resource cleanup. Tests never request real devices or use computer automation. Run `make check` for the application suites and `.venv/bin/python -m tests.turn_smoke` for an isolated, network-disabled TURN startup check. The latter pulls the pinned image if needed and always removes its temporary container.

Before claiming real-network compatibility, manually verify audio in both directions, video, mute/camera controls, decline/cancel, a missed call, navigation/minimizing, blocking and logout during a call, device denial, mobile layout, and two different networks in Chrome/Firefox. Force relay mode and inspect the selected ICE candidate pair in your browser's WebRTC diagnostics to confirm that TURN was used. This manual matrix is not replaced by mocked tests.
