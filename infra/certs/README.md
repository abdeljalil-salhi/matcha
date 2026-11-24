# Local TLS certs

Put local development cert/key files here (ignored by git), for example:

- `dev.crt`
- `dev.key`

Generate a cert trusted by your devices with `mkcert`:

```sh
mkcert -install
mkcert 192.168.1.55 localhost 127.0.0.1 ::1
# rename outputs to dev.crt/dev.key, or point TLS_CERT_FILE/TLS_KEY_FILE at them
```

Then set in `.env`:

```ini
FRONTEND_URL=https://192.168.1.55:5173
ALLOWED_ORIGINS=https://192.168.1.55:5173,http://localhost:5173
COOKIE_SECURE=true
TLS_CERT_FILE=/app/infra/certs/dev.crt
TLS_KEY_FILE=/app/infra/certs/dev.key
```

Recreate frontend: `docker compose up -d --force-recreate frontend api`.
