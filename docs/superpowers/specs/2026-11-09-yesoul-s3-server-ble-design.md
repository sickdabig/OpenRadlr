# Yesoul S3 on the server's Bluetooth — design

Date: 2026-11-09 · Status: agreed with the operator, awaiting spec review

## Goal

A home server operator whose Yesoul S3 spin bike stands next to the machine
running OpenRadlr wants to ride with that bike from any browser in the house —
without Web Bluetooth, which neither reaches the bike from another room nor
runs on every client. The **server** owns the Bluetooth link to the bike and
relays its telemetry to the riding client over the existing WebSocket.

The bike itself has no FTMS and no remote resistance control (the S3's brake
knob is mechanical), so only data flows: power, cadence, resistance and the
bike's distance counter. Everything downstream — telemetry → game, ride
recording, AFK checks, races, the studio — works unchanged, because the client
keeps sending `telemetry` as it does for any trainer.

## Decisions

| Question | Decision |
| --- | --- |
| Who talks Bluetooth | The server, behind the cargo feature `bike` (default off), using `btleplug` |
| Who rides | A browser client; it claims the bike with a new `use_bike` message after `join` |
| Claim | One rider at a time; a second claimant gets `bike_busy`, no bike configured `bike_unavailable`. The claim is per connection; a reconnecting rider re-claims (same rider id keeps it across takeover) |
| Wire | Server → client `bike` messages (`connected`, `power`, `cadence`, `resistance`, `distance_m`) to the claimant only — no broadcast of private telemetry |
| Discovery | `GET /api/info` gains `bike {kind, connected}` when `OPENRADLR_BIKE` is set; only then does the start menu offer it |
| Configuration | `OPENRADLR_BIKE=yesoul` enables the link; any other value is a config error. Built without the feature, the server logs a warning and starts without the bike |
| Client device | New `ServerBikeTrainer` implementing the shared device interface (`on("data")`, no-op `setGrade`/`setTargetPower`, `disconnect`), so `main.js` treats it like a power-only trainer |
| UI | When the server advertises a bike, the trainer card gains a second action: "Connect bike on server" (i18n en + de). The choice is remembered per browser and re-claimed after reconnects |
| Yesoul protocol | Per `docs/yesoul-s3-protocol.md`: name contains `yesoul` (case-insensitive), init packet `f5 20 20 40 f6` to `0xFFF1` with write response, then subscribe `0xFFF4`, 12-byte packets, big-endian |
| Link timeouts | Silence > 2 s reads as zero, > 15 s as stale (reconnect); connected but no first packet within 30 s also reconnects. All constants from the protocol doc |
| Out of scope | Resistance control (the S3 has none), writing to the bike, other Yesoul models/layouts, auto-reboot tricks |

## Why a claim instead of a broadcast

Private trainers' data is personal (who is pedalling, how hard). The rest of
the protocol sends a rider's data to everyone anyway (state messages), but the
bike feed exists before and after rides and on servers with strangers; a
one-claim model is also the simplest correct answer to two tabs fighting over
one bike. The claim costs one client message, one error code and a mutex —
cheaper than retrofitting privacy later.

## Server

- `server/src/ble/yesoul.rs` (always compiled, pure): `parse_packet`
  (12 bytes, rejects other lengths; distance raw/100 km → metres; power
  u16 BE; cadence u8; resistance u8) and the `Link` state machine fed with
  packets and a ~500 ms tick: fresh reading → publish; > 2 s quiet → one zero
  reading; > 15 s quiet or no first packet within 30 s of connecting → stale,
  the caller drops the connection and reconnects. Time injected; unit-tested
  with byte fixtures from the protocol doc.
- `server/src/ble/mod.rs` (behind `bike`): the manager task — scan (name
  contains "yesoul"), connect, discover, write the init packet
  (`WriteType::WithResponse`), subscribe `0xFFF4`, forward parsed packets
  into a `tokio::sync::watch` channel, honour the `Link` outputs, reconnect
  with a short pause. Plus the `BikeHub`: the watch channel, a one-slot claim
  keyed by rider id (re-claim by the same rider allowed; release on connection
  end), and the public snapshot for `/api/info`.
- Config: `Config::bike: Option<BikeKind>` from `OPENRADLR_BIKE`. `app::build`
  starts the manager task only when the feature is on and the config set;
  otherwise a configured bike logs a startup warning.
- Wire: `ClientMessage::UseBike` → `Action::UseBike` (session: only when
  joined) → `connection.rs` claims and adds the watch receiver to its `select!`
  loop, forwarding each update as `ServerMessage::Bike`. `/api/info` gains
  `bike {kind, connected}`.
- Additive protocol messages keep `PROTOCOL_VERSION` at 2.

## Client

- `ble/serverBike.js`: `ServerBikeTrainer` — `label` "Yesoul S3 (server)",
  `canControlResistance = false`, feeds `on("data")` from `bike` messages,
  mirrors `connected` as connect/disconnect events, no-op control methods.
  Pure logic, tested with fake messages.
- `net/protocol.js`: parse `bike`, send `use_bike`.
- `main.js`: with `app.info.bike`, the trainer card shows the extra button;
  claiming happens on `joined` (first join and after resume). Status strings
  and the live check reuse the existing trainer plumbing. Ignored on servers
  without `bike` in `/api/info`.

## Testing

- `yesoul.rs`: packet fixtures (a real-shaped packet, short/long rejects,
  byte order), link timeouts (fresh, zero after 2 s once, stale after 15 s,
  30 s without first packet).
- `ble/mod.rs`: hub claim — first claim wins, same rider re-claims, other
  rider refused, release frees the slot (with `tokio::time::pause`).
- Session tests: `use_bike` before/after join.
- Client `serverBike.test.js`: forwards readings, connected flag flips,
  control calls resolve without effect, label.
- `make check` green (the feature stays off there — the CI container has no
  libdbus; `cargo check --features bike` is part of the local workflow).

## Docs

- `docs/protocol.md`: `use_bike`, `bike`, `bike_unavailable`/`bike_busy`,
  the `/api/info` field (all within version 2).
- `docs/devices.md`: new "Yesoul S3 via the server" section.
- ADR 0020 "Server-side BLE devices ride through the game socket".
- `CHANGELOG.md` under `[Unreleased]`.
- `.env.dev.example`: `OPENRADLR_BIKE`.
