# Deploying OpenRadlr

The server is one binary. It serves the browser client, the routes and the
WebSocket game on one port (8080 by default). By default it listens on all
interfaces (`OPENRADLR_BIND=0.0.0.0:8080`), so a LAN or Tailscale network can
reach it directly; behind a reverse proxy, bind to `127.0.0.1:8080` instead.
TLS belongs to the proxy in front of it: browsers only allow Bluetooth on
`https://` pages.

## 1. Build and run the server

```bash
git clone <your-repo-url> openradlr && cd openradlr
make setup          # creates .env from .env.example; later runs add new settings
$EDITOR .env
cd server && cargo build --release && cd ..
```

Run the binary with the settings from `.env` in its environment, plus the
paths to the client, the routes and the data directory:

```bash
set -a; . ./.env; set +a
export OPENRADLR_STATIC_DIR=client/public \
       OPENRADLR_ROUTES_DIR=routes \
       OPENRADLR_ROUTE_FILE=routes/rolling-hills.json \
       OPENRADLR_DATA_DIR=data
server/target/release/openradlr-server
```

`OPENRADLR_DATA_DIR` is where Strava logins (SQLite) and the community
distance totals (`stats.json`) are kept, so they survive restarts — back it up
like any data:

```bash
tar czf openradlr-data.tgz -C data .
```

A systemd unit is the usual way to keep it running and restart it on boot:

```ini
[Unit]
Description=OpenRadlr game server
After=network-online.target

[Service]
WorkingDirectory=/opt/openradlr
EnvironmentFile=/opt/openradlr/.env
Environment=OPENRADLR_STATIC_DIR=/opt/openradlr/client/public \
            OPENRADLR_ROUTES_DIR=/opt/openradlr/routes \
            OPENRADLR_ROUTE_FILE=/opt/openradlr/routes/rolling-hills.json \
            OPENRADLR_DATA_DIR=/opt/openradlr/data
ExecStart=/opt/openradlr/server/target/release/openradlr-server
ExecStop=/bin/kill -TERM $MAINPID
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`openradlr-server healthcheck` probes `/healthz` over HTTP — use it as the
unit's health check or in a load balancer. The server shuts down cleanly on
SIGTERM.

Settings for production in `.env`:

```bash
OPENRADLR_SERVER_NAME=Leon's Ride Club
OPENRADLR_PUBLIC_URL=https://ride.example.org
OPENRADLR_TRUST_PROXY=true                 # client IPs from X-Forwarded-For (per-IP limit)
OPENRADLR_MAX_PLAYERS=50                   # trainer riders at the same time, all routes together
OPENRADLR_MAX_PADDLE_PLAYERS=20            # phone riders, in seats of their own
OPENRADLR_MAX_VISIBLE_RIDERS=200           # riders per state message, humans first
OPENRADLR_ALLOW_SIMULATED_TRAINER=false    # only real trainers on the start screen
OPENRADLR_ALLOW_PADDLE_MODE=true           # phone paddles (marked 📱, no Strava, no ride files)
OPENRADLR_PRIVACY_URL=https://ride.example.org/privacy/  # your privacy policy, linked in the start menu
OPENRADLR_ANALYTICS_DOMAIN=              # optional Plausible analytics, off when empty (see .env.example)
OPENRADLR_BIND=127.0.0.1:8080              # only the proxy on this machine can reach it
OPENRADLR_DATA_DIR=/opt/openradlr/data     # Strava logins + distance totals
```

`OPENRADLR_PUBLIC_URL` also becomes the only page origin allowed to open game
connections (`OPENRADLR_ALLOWED_ORIGINS` defaults to it). Without it,
any web page may open a game connection to your server, which is fine on a
home network but not for a public server: always set it there. Only set
`OPENRADLR_TRUST_PROXY=true` when the proxy is the only way in, otherwise
anyone could fake their address in the header.

Deploy new commits later with: `git pull`, `cargo build --release`, restart the
service. A restart drops everyone who is riding.

## 2. Caddy on the same machine

Caddy proxies WebSockets and sets `X-Forwarded-For` on its own:

```caddyfile
ride.example.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
```

Any other reverse proxy (nginx, Traefik) works the same way: terminate TLS,
proxy everything — HTTP and WebSocket — to the server's port.

## Landing page

The official server splits into two addresses: a static landing page on the
main domain (`openradlr.com`, from `landing/`) and the app on a subdomain
(`app.openradlr.com`). Self-hosters who don't want a landing page leave this
out; nothing changes for them.

1. DNS: `A`/`AAAA` records for the bare domain, `www` and `app`, all to the
   server.
2. Build the page with Node (see [landing/README.md](../landing/README.md)),
   with the addresses baked in at build time:

   ```bash
   cd landing
   npm ci
   PUBLIC_SITE_URL=https://openradlr.com \
   PUBLIC_APP_URL=https://app.openradlr.com \
     npm run build        # static files in landing/dist
   ```

3. Serve `landing/dist` with any static file server and point the bare domain
   at it. With Caddy:

   ```caddyfile
   openradlr.com {
   	encode zstd gzip
   	root * /opt/openradlr/landing/dist
   	file_server
   }
   www.openradlr.com {
   	redir https://openradlr.com{uri} permanent
   }
   app.openradlr.com {
   	encode zstd gzip
   	reverse_proxy 127.0.0.1:8080
   }
   ```

4. **Strava:** the *Authorization Callback Domain* in the Strava API settings
   must be the app subdomain (`app.openradlr.com`). Change it when moving the
   app, then check *Connect with Strava* once.

The page's links are baked in at build time, so rebuild it after changing the
`PUBLIC_*` variables.

## Strava (optional)

1. Create an API application at <https://www.strava.com/settings/api>.
   *Authorization Callback Domain*: the host of your public URL, e.g.
   `ride.example.org`.
2. In `.env`:

   ```bash
   OPENRADLR_STRAVA_CLIENT_ID=12345
   OPENRADLR_STRAVA_CLIENT_SECRET=…
   OPENRADLR_REQUIRE_STRAVA=false   # true: riders must connect Strava to ride
   OPENRADLR_SECRET_KEY=…           # openssl rand -hex 32; keeps logins across restarts
   ```

3. Restart the server.

To try it locally, copy `.env.dev.example` to `.env.dev` and run `make dev`
(see the comments in that file). Strava accepts `localhost` and `127.0.0.1` as
callback domains, so the same Strava app works locally. Open the app at
`http://localhost:7777` (the `OPENRADLR_PUBLIC_URL` in that file).

Riders then see *Connect with Strava* on the start screen. After a ride,
*Finish ride* offers *Upload to Strava* (and `.tcx`, `.gpx` and `.fit` downloads either way).
Strava gets a FIT file marked as a virtual ride (`sub_sport` virtual activity):
Strava files it as a *Virtual Ride* and keeps the ride's own elevation. Its
elevation map would see open sea there and drop the climbing, as it did for
the TCX uploads before.
With `OPENRADLR_REQUIRE_STRAVA=true` every rider needs a real Strava account,
and one account can ride only once at a time — a simple hurdle against bots
and scripts.

Strava logins are saved in a SQLite database in `OPENRADLR_DATA_DIR`
(`data/` in the example above), so riders stay connected through restarts and
updates. Session ids are stored only as hashes and refresh tokens are encrypted with
`OPENRADLR_SECRET_KEY`, which must stay the same across deploys (changing it
logs everyone out once, which is harmless). Without the key logins stay in
memory and are lost on every restart. Back the directory up like any data
(`tar czf openradlr-data.tgz -C data .`).

The start menu also shows how far everyone has ridden on the server, on
trainers and on phones. Only the two kilometre totals are kept, in `stats.json`
next to the database (set `OPENRADLR_STATS_FILE` to put it elsewhere); without a
data directory they restart from zero. Riders declare their own device, so the
numbers are for fun, not a leaderboard.

Things to know:

- Sessions are kept in memory. After a restart riders press *Connect* again;
  Strava skips its consent screen the second time.
- A new Strava API app may be limited to a single athlete until Strava
  approves it for more ("athlete capacity" in the API settings).
- Uploads carry GPS positions in a virtual world off Mallorca (see
  [routes](routes.md#on-the-map)), so Strava shows a map. Once Strava has
  processed an upload, the server sets the sport type to *Virtual Ride*,
  which keeps it off real-world segments.

## Protection against floods and scripts

| Setting | Default | What it limits |
| --- | --- | --- |
| `OPENRADLR_MAX_PLAYERS` | 50 | Trainer riders at the same time across all routes (phone riders not counted) |
| `OPENRADLR_MAX_PADDLE_PLAYERS` | 20 | Phone-paddle riders at the same time, in seats of their own so they never block a trainer rider |
| `OPENRADLR_MAX_VISIBLE_RIDERS` | 200 | Riders in one state message; humans first, then the nearest bots |
| `OPENRADLR_MAX_CONNECTIONS_PER_IP` | 4 | Open game connections per IP (needs `OPENRADLR_TRUST_PROXY` behind a proxy) |
| `OPENRADLR_MESSAGES_PER_SECOND` | 20 | Messages per connection (the client sends about 4); floods are dropped, then the connection is closed |
| `OPENRADLR_ALLOWED_ORIGINS` | the public URL | Pages from other sites can't open game connections |
| `OPENRADLR_REQUIRE_STRAVA` | false | Riders need a Strava account; one ride per account |
| `OPENRADLR_GRACE_S` | 60 | How long a rider whose connection dropped is kept (coasting, holding their place) before being removed; 0 removes at once |
| `OPENRADLR_AFK_TIMEOUT_S` | 1800 | Seconds of 0 W before a "Still riding?" warning; an unanswered warning removes the rider. 0 turns it off |
| `OPENRADLR_AFK_REMINDER_S` | 600 | Seconds of 0 W after "Stay" before the next warning |

Connections must say hello and join within 15 s, and silent connections are
closed after 120 s. Chat is limited to bursts of 5, then one message every
2 s. Trainer data is still trusted (watts are only clamped to 2500 W); this
is about keeping a small community server usable, not about stopping a
determined cheater.

## Routes

Every `*.json` file in `OPENRADLR_ROUTES_DIR` becomes a world riders can pick on the
start screen; `OPENRADLR_ROUTE` is the default and listed first. Drop a new
file in and restart the server. See [routes](routes.md).
