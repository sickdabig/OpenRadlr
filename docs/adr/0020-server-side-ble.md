# 0020. Server-side BLE devices ride through the game socket

Date: 2026-11-09

## Context

Until now every device spoke to the *browser*: Web Bluetooth in
`client/public/js/ble`. That fits the usual setup (the rider's screen is next
to the trainer), but not a home server whose bike stands next to the server
itself while the rider looks at a screen across the room — or a phone that
has no Web Bluetooth at all (iPhone, Safari, Firefox). The first such device
is the Yesoul S3 spin bike; its proprietary protocol is documented in
[`docs/yesoul-s3-protocol.md`](../yesoul-s3-protocol.md), and it has no
remote resistance control, so only readings flow.

## Decision

The **server** owns the Bluetooth link. A `btleplug`-based manager (cargo
feature `bike`, opt-in — Linux needs libdbus, which the CI container does not
have) connects to the bike and pushes readings into a hub. The riding client
claims the bike over the game WebSocket (`use_bike`), gets `bike` messages,
and feeds them into the very same device interface a Web Bluetooth trainer
implements — so telemetry, ride recording, AFK and races need no changes.

One claim at a time: the readings belong to one rider, a second claimant gets
`bike_busy`. The claim dies with the connection.

## Consequences

- Any OpenRadlr client can ride a server-side bike, including browsers
  without Web Bluetooth.
- The server needs a Bluetooth adapter, BlueZ running and `libdbus` at
  runtime; the feature stays out of default builds, so plain deployments and
  CI are unaffected (`use_bike` then answers `bike_unavailable`).
- The pure parts of a device protocol (packet parsing, timeout rules) live
  outside the feature gate and are unit-tested against fixtures; only the
  adapter itself trusts the hardware.
- More server-side devices (other trainers, heart rate straps) slot into the
  same shape: a hub, a claim, a message. Control traffic (grade/ERG to the
  device) is future work, possible over the same channel.
- The client trusts the server's readings like it trusts any device: the
  server can't tell power from pedalling either way.
