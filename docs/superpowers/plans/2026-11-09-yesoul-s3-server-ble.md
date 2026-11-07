# Yesoul S3 on the server's Bluetooth — implementation plan

Spec: `docs/superpowers/specs/2026-11-09-yesoul-s3-server-ble-design.md`
Branch: `feat/yesoul-s3-server-ble` · Built with the cargo feature `bike`.

## Steps (each lands with its tests)

1. **Pure Yesoul protocol** — `server/src/ble/{mod,yesoul}.rs`:
   failing tests for `parse_packet` (real-shaped 12-byte packet with
   big-endian power/distance, rejects 11 and 13 bytes) and the `Link`
   machine (fresh, zero once after 2 s, stale after 15 s, stale 30 s after
   connecting without a packet). Then make them pass.
2. **Config** — `Config::bike` from `OPENRADLR_BIKE` (`yesoul` valid, other
   values a `ConfigError`), with tests.
3. **Cargo feature + manager + hub** — `btleplug` behind
   `bike = ["dep:btleplug"]`; `ble/mod.rs` manager task (scan/connect/
   handshake/stream/reconnect) and `BikeHub` (watch channel, one claim by
   rider id) with claim tests under `tokio::time::pause`.
4. **Wire** — `use_bike` client message, `Action::UseBike`,
   `ServerMessage::Bike`, connection claim + forwarding, `/api/info`
   `bike {kind, connected}`. Session tests; app wiring with the hub.
5. **Client adapter** — `ble/serverBike.js` + `client/test/serverBike.test.js`;
   `protocol.js` additions.
6. **Client wiring** — `main.js` (button, claim on `joined`, status),
   `index.html` (second button on the trainer card), i18n en + de.
7. **Docs** — protocol.md, devices.md, ADR 0020, CHANGELOG, .env.dev.example.
8. **Verify** — `make check` equivalent locally (cargo fmt/clippy/test for the
   workspace, client lint + tests; the feature build
   `cargo check --features bike` on top). Live ride on the host machine.

## Notes

- CI (`make check`) never builds the `bike` feature: the container image has
  no libdbus. Everything pure stays outside the gate.
- The S3 sends ~1 packet/s while pedalling and may fall silent at rest; the
  client keeps sending `telemetry` from the last reading, zeros included —
  the existing AFK machinery owns idle riders.
