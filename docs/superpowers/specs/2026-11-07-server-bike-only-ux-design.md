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

The server decides, through one config flag, and tells the browser in
`/api/info`.

- **Server:** `OPENRADLR_CLIENT_DEVICES` = `off` (default) | `on`.
  `client_devices` in `/api/info` is the computed verdict, additive, protocol
  stays version 2 (`docs/protocol.md` notes it): **always yes when the server
  has no bike of its own** (riders must bring devices), else the flag.
- **Client:** `clientDevices(info)` (startMenu.js) reads that verdict;
  `webBle()` in main.js amplifies it with the browser's Web Bluetooth
  availability and drives, in `renderRideModes`:
  - the connect/reconnect rows for trainer, HR strap and controller hide
    (the `.no-bluetooth` class hides all `.bluetooth-only` rows);
  - the Heart rate / Controller add-on rows never show (`addonsShown`);
  - the "Smart trainer" card's hint reads **"Server's bike"**, not Bluetooth;
  - the Bluetooth warning stays silent — nothing about the browser is the
    rider's fault when the answer is "there is nothing to connect here";
  - known-device auto-reconnect is skipped (`initKnownDevices`).
- Paddles and simulator stay, unchanged (guests without any gear); the
  server-bike line, the live reading and the power-only note stay; riding the
  bike is unchanged: click once, auto-claim after.
- Everything else — diagnostics, settings, gear fields for real trainers —
  returns with the flag `on` or a server without a bike.

## Consequences

- Riders on a server-bike-only box see exactly two ways to ride plus the sim:
  the server's S3, phone paddles, simulator.
- A rider with their own trainer on such a server cannot connect it — owner's
  choice, reversible with the env var and a restart.
- No client change remembers anything new; nothing is removed from the code.
- The `Ride the server bike` line becomes the trainer panel's primary action.
