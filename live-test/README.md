# live-test

A throwaway nginx setup for exercising a **production build** (`../dist`) against
the real Posda API, without running the webpack dev server.

It does two jobs:

1. Serves the built app (the contents of `../dist`) under `/mira/`.
2. Reverse-proxies `/papi` and `/files` to the Posda host, injecting the
   `Authorization` bearer token — mirroring the webpack devServer proxy config.

## Usage

Build the app first (so `../dist` is current), then:

```bash
docker compose up -d
```

Open **https://localhost/** (plain `http://localhost/` redirects to HTTPS).

Tear down with `docker compose down`.

## Caveats

- **Self-signed cert.** TLS uses a self-signed certificate in `certs/`
  (CN/SAN `localhost`). Your browser will warn on first visit — accept the
  exception once. The cert and key are committed for convenience since this is
  a throwaway test harness — do not reuse them anywhere real. Regenerate with:

  ```bash
  mkdir -p certs && openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout certs/server.key -out certs/server.crt \
    -days 825 -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  ```

- **HTTPS is required, not cosmetic.** The app uses SharedArrayBuffer, which
  needs COOP/COEP headers and a secure context. Those headers are set on the
  `/mira/` responses here.

- **`/mira/` base path is mandatory.** The built `index.html` references
  `/mira/bundle.js` (webpack `publicPath`). Serving `dist` at `/` would 404 the
  bundle.

- **Privileged ports.** Compose binds host ports **80** and **443**. If another
  service already holds them you'll get a bind error — stop it or remap in
  `docker-compose.yml`.

- **The proxy token is not a production credential.** The bearer token baked
  into `nginx.conf` matches the webpack devServer config and points at a test
  Posda instance (see `../TECH_DEBT.md`).

- **`/papi` has a 300s timeout.** Some Posda queries are slow, so the upstream
  read/send/connect timeouts are raised to 5 minutes for `/papi`. `/files`
  responds quickly and uses nginx defaults.

- **`/files` shares the `/papi` upstream.** Both point at the same Posda host.
  If `/files` should target somewhere else, update the `location /files` block.
