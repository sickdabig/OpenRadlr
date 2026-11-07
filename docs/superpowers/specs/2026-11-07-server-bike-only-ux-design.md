# Server-Bike-Only Client Devices — Design

*2026-11-07 · ADR 0020 follow-up · companion plan: `../plans/2026-11-07-server-bike-only-ux.md`*

## Context

A home server now owns its one Yesoul S3 (ADR 0020). Its owner needs none of
the client-side Web Bluetooth UX — no trainer chooser, no HR strap, no Zwift
Click, no reconnect or known-device buttons, no Bluetooth-unavailability
warning. Today that UX is all still on display; the server-bike line is a
small extra line under the trainer card, and browsers without Web Bluetooth
only reach it through the fallback steering we added.

But OpenRadlr stays a house where a second rider may bring their own trainer:
the server-bike line was designed exactly for *one* bike claimed among several
riders with their own devices. So this is not a code deletion but a server
decision about which client experience it offers, told to the browser.

## Decision

The server gains one config flag, and the client collapses its device
connecting UI accordingly.

- **Server:** `OPENRADLR_CLIENT_DEVICES` = `on` (default) | `off`.
  Additive field in `/api/info`: `"client_devices": true | false`.
  Protocol stays version 2 (additive), `docs/protocol.md` notes the field.
- **Client:** when `client_devices` is false and the server offers a bike:
  - the connect/reconnect rows for trainer, HR strap and controller vanish;
  - the Heart rate / Controller add-on rows never show;
  - the "Smart trainer · Bluetooth" card's hint reads **"Server's bike"**;
  - the trainer panel shows only the server-bike line, the live reading and
    the power-only note — ride it like today: click once, auto-claim after;
  - known-device auto-reconnect for BLE devices is skipped (nothing there to
    reconnect — that path ran only with a persisted grant anyway);
  - paddles and simulator stay, unchanged (guests without any gear);
  - the Bluetooth warning machinery goes quiet (the bike rides without it).
- Everything else — diagnostics, settings, gear fields for real trainers —
  is untouched and returns with the flag on.

## Consequences

- Riders on a server-bike-only box see exactly two ways to ride plus the sim:
  the server's S3, phone paddles, simulator.
- A rider with their own trainer on such a server cannot connect it — owner's
  choice, reversible with the env var and a restart.
- No client change remembers anything new; nothing is removed from the code.
- The `Ride the server bike` line becomes the trainer panel's primary action.
