# 0021. The browser stops talking to Bluetooth

Date: 2026-11-11

## Context

ADR 0020 moved the Bluetooth link for the Yesoul S3 to the server: the bike
stands next to the server, its readings flow over the game socket, and any
browser in the house can ride it. That left two ways to ride a real device —
the server's bike and, behind the operator's `OPENRADLR_CLIENT_DEVICES` flag,
the old browser path: Web Bluetooth in `client/public/js/ble`, with the device
chooser, heart-rate straps, Zwift controllers, reconnect buttons and the
secure-origin warnings.

The browser path now earns its keep nowhere. The POC's own setups ride the
server bike or the simulator; a rider whose trainer sits at their desk is the
rare case, and supporting it keeps roughly nine client modules, a fake
Bluetooth test double and a per-server flag alive — plus a second UX
(`client_devices` in `/api/info`, conditional panels, i18n keys) that every
change has to respect.

## Decision

The client has no Web Bluetooth code. All of `client/public/js/ble` except the
device adapters that ride server messages (`ServerBikeTrainer`,
`SimulatedTrainer`, `PaddleTrainer`) and the diagnostics log is removed, as are
the controller input path, the `/api/info` `client_devices` field and the
`OPENRADLR_CLIENT_DEVICES` flag. The start menu offers the server's bike (when
the server has one), phone paddles and the simulator; nothing else.

## Consequences

- Any browser rides, a phone without Bluetooth support included; the
  secure-origin (HTTPS) requirement exists only for deployments that want it,
  not for devices.
- Heart rate straps and Zwift controllers no longer work anywhere; a future
  native client or a server-side hub (ADR 0020's shape) would bring them back.
- Virtual shifting and ERG stay, but only for trainers that can change
  resistance through the server; the S3's mechanical brake knob is not one.
- The device interface (`on("data")`, `setGrade()`, `disconnect()`) is
  unchanged, so a future device kind slots in without touching the ride.
