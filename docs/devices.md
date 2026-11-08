# Devices

| Device | Protocol | Status |
| --- | --- | --- |
| Yesoul S3 spin bike (the server's own) | proprietary Bluetooth on the server's adapter | Supported: power, cadence, resistance, distance — see [ADR 0020](adr/0020-server-side-ble.md) |
| Simulated trainer (for testing and indoor fun) | none — power is set in the UI | Supported |
| Phone paddles | WebSocket to the server | Supported: steering, shifting, menus |
| ANT+ FE-C | ANT+ USB stick | Planned for native clients |

The browser never talks to Bluetooth itself: the client has no Web Bluetooth
code, so any browser can ride, a phone without Bluetooth support included.
Devices reach the app through the server.

## The server's bike (Yesoul S3)

A server built with the `bike` cargo feature and started with
`OPENRADLR_BIKE=yesoul` connects to a Yesoul S3 spin bike over **its own**
Bluetooth adapter. The protocol lives in
[`yesoul-s3-protocol.md`](yesoul-s3-protocol.md); the pieces are the
proprietary service `0xFFF0`, a subscription to the 12-byte notifications on
`0xFFF4` **before** the init packet (`f5 20 20 40 f6`) is written to `0xFFF1`
without response (probed against the real bike, 2026-11: a write with response
answers the vendor ATT error 0x20, and pairing is neither needed nor answered),
and ~1 Hz packets with power, cadence, resistance and a distance
counter, all big-endian.

The bike's connection is the server's business, the origin of the readings is
honest-theft-proof: the client gets `bike` messages and rides them like any
power-only trainer (the S3's brake knob is mechanical — no remote resistance).
Silence works like the bridge's: over 2 s of quiet reads as zero, over 15 s
(or 30 s after connecting without a single packet) drops and reconnects.

**Using it.** The start menu shows a *Ride the server bike* line when
`/api/info` offers a `bike`. One rider at a time: the first `use_bike` after
joining claims it, a second rider is told it is busy, and whoever comes back
after a dropped connection claims again. The choice is remembered per
browser; the server keeps the bike connection across riders.

**The bike is only borrowed.** The server reaches for the bike only while a
rider holds a claim: the first `use_bike` after joining starts the Bluetooth
link, and when the claim ends (the ride ends, the connection closes) the
link hangs up again. Between claims the bike is not connected at all, so
other apps — Zwift, the manufacturer's own app — can pair with it freely;
OpenRadlr never holds the bike in the background.

Linux needs `bluetoothd` (BlueZ) running and `libdbus`; without the `bike`
feature the server starts fine and answers `use_bike` with
`bike_unavailable` (see [ADR 0020](adr/0020-server-side-ble.md)).

## Diagnostics

The setup screen shows live power and cadence as soon as the server bike is
connected, and *Device diagnostics* lists what the server reports and the
first 20 raw packets per source in hex. *Copy report* puts all of it on the
clipboard for a bug report. During a ride, the Trainer panel warns if no data
arrived for 5 seconds.

A "connected but 0 W" on the server bike is the server's business: check the
server's logs — another app (Zwift, the manufacturer's phone app) may still be
connected to the bike, or the bike is out of the server adapter's range.

## Virtual shifting (single-gear setups)

Where the trainer can change resistance (the simulated trainer; a future
resistance-controllable server bike), OpenRadlr shifts **in the app** instead
of relying on proprietary trainer firmware:

- 24 virtual gears (ratio 0.75 to 5.0); the rider enters the real gear
  (chainring × cog) on the setup screen.
- For virtual ratio *r* and real ratio *r₀* (k = r / r₀) the trainer resists
  with `k · max(F_road(v), F_floor)`, where *v* is the rider's speed in the
  game: each gear changes the force by its own step (about 9 %), whatever the
  cadence. `F_floor` (1.5 % in the real gear) leaves something to push against
  on descents. The app solves for the grade that produces this force and sends
  it with no air drag of the trainer's own (`cw` 0), so the trainer adds nothing
  that depends on its wheel speed (`ride/virtualShifting.js`, unit-tested). It
  is re-sent as the speed changes.
- `F_road` uses the server's numbers for this rider: mass with the bike, drag
  area, Crr and air density from `joined.physics` (see
  [ADR 0019](adr/0019-calibrated-physics.md)). The same Crr goes to the trainer,
  since the app assumes the trainer adds it.
- Climb feel doesn't apply with gears, and its sliders hide: the gears make a
  climb as easy as the rider wants (#22).
- Changes of grade reach the trainer eased in over a few seconds (at most
  1.5 % per second), shifts at once. The server measures grades over 50 m of
  road, so they don't step at every point of the route.
- Gears only change how hard a pedal stroke feels. Power still decides the speed
  on the server, exactly like real gears.

Shift with <kbd>E</kbd>/<kbd>Q</kbd> or the on-screen buttons.

## Staying connected

The server keeps its bike connection across riders and reconnects on its own
while a claim holds; from the client's side a drop looks like the bike going
quiet, and the rider who comes back claims it again (see
[ADR 0020](adr/0020-server-side-ble.md)).
