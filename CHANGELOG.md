# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- A workout library on the start menu's new Training tab: pick a structured workout — the four presets or an imported one — and start the ride with it already running from its warm-up. No class schedule and no digging through the ride menu: riding alone, the workout begins when you do, on the server's default route. Imported `.zwo` workouts are kept in the browser, so the library survives reloads, and the in-ride Training page lists them too. A trainer that only reports power runs the workout guided (targets to follow), like in a studio class.

- The server can ride a bike of its own: with the `bike` cargo feature and `OPENRADLR_BIKE=yesoul`, it connects to a Yesoul S3 spin bike over its own Bluetooth adapter and streams power, cadence, resistance and distance to one riding client — no Web Bluetooth needed, so any browser in the house (a phone without Bluetooth support included) can ride the bike standing next to the server. The start menu offers "Ride the server bike" when the server has one; one rider at a time, and the rider coming back after a dropped connection claims it again. Silence reads as zero after 2 s, a lost bike reconnects; see ADR 0020.

- A rider who sits at 0 W for 30 minutes gets a "Still riding?" warning with Stay and Leave now, two minutes to answer. Stay gives three more reminders 10 minutes apart, then a final one with Leave now only; no answer removes the rider, so an idle rider no longer holds a seat. Pedalling resets the clock, and workouts are exempt. `OPENRADLR_AFK_TIMEOUT_S=0` turns it off. Outcomes are counted in `openradlr_afk_events_total`.
- Seasons: a rider can pick how the world looks (Settings, or the Season picker in the ride menu) without changing the road, the café, the gym or where anything stands. Temperate and Winter are available; trees, road, buildings and terrain change shape, never place. Winter re-dresses its world: posts become snowmen (yellow-scarfed every kilometre), farm animals become caribou, polar bears and walruses, hay bales become firewood stacks, village lamps become wooden lanterns, roadside spectators become clapping penguins in winter coats, event barriers change colour, the sky and light turn pale and cold with a lower, broader cloud ceiling and falling snow, the river freezes into opaque ice with wind-blown snow patches, and ploughed snow banks open up where roads meet instead of crossing them. The season pickers preview each season with colour swatches. A season changed at any time — also while a world is still building, or in the start menu just before a ride — carries into the ride; the last pick wins. The pick is remembered per browser, and `?biome=<id>` previews one. See ADR 0018.
- German translation and a language selector (start menu and Rider panel). The language follows the browser by default and the choice is remembered. Server content such as route names stays as the server sends it.
- The in-game menu is a dialog centred over the dimmed ride: a page list (Overview, View, Vehicle, Race, Events, Training, Settings) next to the open page, full screen with the list first on a phone. Photo and Finish ride stay pinned at its foot (#19).
- The menu's Overview shows the ride so far: power over the last 10 minutes, weighted power, load and best efforts, with a live power, speed and grade strip on top (#19).
- A View button in the top bar opens a small popover for camera, layout, 2D/3D and time of day; it replaces the separate camera and layout buttons (#19).
- Workouts at their own café gym with statues of their figures, and workout cards with a block strip (#26)

### Changed

- Riding speeds are calibrated: 200 W on the flat is about 31 km/h for 75 kg, descents are slower, and heavier riders have more air drag (#22).
- Climb feel no longer applies with virtual shifting; the gears do it (#22).

### Removed

- Web Bluetooth in the browser: the client no longer connects to smart trainers, heart rate straps or Zwift controllers itself. Riders ride the server's own bike (see the `bike` feature above), the simulated trainer or phone paddles; the start menu's device chooser, heart-rate and controller rows, reconnect buttons and Bluetooth warnings are gone, and `/api/info` no longer reports a `client_devices` field.

- The Docker deployment path: `Dockerfile`, `docker-compose.yml`, the bundled Caddy and landing containers and the `make up` / `down` / `update` targets are gone, and the Makefile no longer runs cargo/npm in throwaway containers when they are missing — install Rust and Node on the host. Run the release binary directly behind your own reverse proxy; see [docs/deploy.md](docs/deploy.md).

### Fixed
- The Yesoul S3 never accepted the server's handshake: the bike answers the init packet written **with** response with its vendor ATT error 0x20 and stays silent (probed against the real bike, missing from the earlier bridge-based doc). The link now subscribes to the telemetry notifications first and writes the init packet without response; pairing takes no part (the bike ignores pairing attempts). The failing handshake also retried at scan speed, hammering the bike — the reconnect pause now applies between attempts.
- The server's bike link came up never: the scan–reconnect loop started a new BLE scan on every cycle, and BlueZ answers a start while it is already scanning with "Operation already in progress" — the retry treated that as a fatal error and so never reached the point where the bike is looked for. A scan start that finds one already running is kept now.
- A failed network request no longer leaves the app as text and pictures only: when the server couldn't be reached, the offline fallback served the start page's HTML for every script, style and image, so every module failed with a MIME-type error and nothing started. Only page navigations fall back to the cached shell now; anything else reports its real network error.
- Name labels no longer float over houses and hills: a rider out of sight (the GPU checks each one) has no label, with a short delay so labels don't flicker at an edge. Labels point at their rider with a small tail and get smaller and fainter with distance (#15).
- A finished ride is no longer stored twice in the ride history when it was finished, continued and finished again (#19).

### Fixed
- The trainer's live check says whether data arrives ("Connected · pedal to check", "✓ 182 W · 88 rpm", "No data for 7 s").
- The start menu's panel is solid (it could render see-through in Chrome).
- Virtual shifting's gear is one line ("Chain on 34 × 14 teeth").

### Changed
- "Trainer difficulty" is now "Climb feel", explained, in Settings and the ride menu.
- Finishing a ride is final: Finish ride asks first, then shows the summary with its chart; there is no "Keep riding" any more, and the ride can't be continued from the start menu afterwards (#19).

### Changed
- Start screen: tabs for Ride, Studio, Workout and Events; the picked route is described once, above compact route cards.
- Start screen: "How are you riding?" picks a smart trainer, phone paddles or the simulator; the choice is remembered. Heart rate and controllers are optional add-ons on their own lines.
- Start screen: the Ride button is always in reach, at the bottom of the panel on wide screens and in a bar along the bottom on tablets and phones. Splits, auto-pause and units are folded into Settings.
- Start screen opening: placeholders while the server answers, "Loading the island…" while it builds, then the island fades in and the camera descends from high above onto the picked route before the map docks in its corner.
- Start screen: Strava is one line in the Rider section (connect, or who you're connected as); where a server requires Strava, the Ride button connects it. Boarding a friend's vehicle is a code field under Ride: a valid code turns Ride into Board.
- `make dev` reads an optional `.env.dev` (see `.env.dev.example`), e.g. for all routes or to try Strava locally.
- Name, weight, FTP and settings are kept in the browser as soon as they change, not only when a ride starts.

### Fixed
- The picked route's band no longer flickers orange and white where routes share a road (it lay at the same height as the other routes' bands).
- The drone camera behind the start menu glides: it takes the road's bends in smooth arcs, flights ease in and out without a jolt, and a new world is swapped in only once the camera has landed.
- The start menu no longer flickers: no live blur over the moving island, and route cards and tabs are only redrawn when they change.
- "Weight (kg)" no longer breaks over three lines.
- The start screen no longer widens past the screen on narrow phones (320 px).
