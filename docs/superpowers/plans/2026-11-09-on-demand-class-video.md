# Plan: on-demand studio classes and a video on the studio's screen

Spec: `docs/superpowers/specs/2026-11-09-on-demand-class-video-design.md`

TDD throughout: the failing test first, then the smallest change that passes
it. `make check` at the end (CI parity).

## 1. Sim: a practice class per room (`server/crates/sim/src/studio.rs`)

Tests first (in `studio.rs`'s `mod tests`):

- `starting_a_class_anchors_the_rooms_clock_now` — `start_class(0,
  "climb-pyramid")` makes `clock_of(0)` report that class at `elapsed_s == 0`
  while `clock()` (and room 1's clock) stay on the timetable.
- `the_practice_room_rides_its_class` — with the timetable in a lobby (target
  `None`), a room that started "sweet-spot" has its bots riding the class's
  target and accumulating `class_seconds`.
- `starting_a_class_resets_the_rooms_scores` — ride a while, start a class,
  the room's `class_seconds`/`class_joules` are back to zero.
- `the_class_ends_and_the_room_returns_to_the_timetable` — advance past the
  class's duration: `clock_of(0)` is the timetable's clock again and the
  scores were reset once.
- `a_slot_rollover_leaves_a_practicing_rooms_scores_alone`.
- `unknown_class_or_room_is_refused` — `start_class` returns `false` for a
  bad id and a room out of range.

Then the implementation: `Practice { class_index, starts_at_s }`,
`practices: Vec<Option<Practice>>` kept parallel to `rooms` (push a `None`
where a room is added, drop the entry where one is removed —
`balance_bots`), `start_class`, `clock_of`, per-room targets and resets in
`tick`.

## 2. Server: the `start_class` message

Tests first:

- `protocol.rs`: `StartClass` parses `{"type":"start_class","class_id":"tempo"}`.
- `server/src/studio.rs`: a rider's `start_class("tempo")` makes the next
  `studio_state` carry `tempo` with `starts_at_s` at the tick and `elapsed_s`
  ≈ 0; an unknown id answers `error` `class_unknown` and leaves the class.
- `server/src/game.rs`: a route game ignores `start_class` (no error, no
  crash).

Then: `ClientMessage::StartClass`, `Command::StartClass` + dispatch
(`runtime.rs`), `Game::start_class` (default no-op), `StudioCore::start_class`
(anchor, immediate `studio_state` to the room, `class_unknown` via
`reply_error`-style error), `studio_state_message` on `studio.clock_of(room)`.

## 3. Client: send `start_class` and pick a class in the studio

Tests first (`client/test/studio.test.js` or a new
`client/test/studioClass.test.js`):

- `ClientMessages.startClass("tempo")` builds `{ type: "start_class",
  class_id: "tempo" }`.
- The picker's options come from the catalog (id + name), the start action
  sends the picked id through the connection fake, and an empty catalog
  disables the controls.

Then: `net/protocol.js` `startClass`, `net/connection.js` `startClass`,
`index.html` picker (`#studio-class-pick`, `#studio-class-start`) in the
studio panel, `main.js` wiring (populate from `app.studio.classes`, send on
click).

## 4. Client: the video on the screen

Tests first (`client/test/videoScreen.test.js`):

- The screen box exported from `studioScene.js` matches the mesh the scene
  builds (center/size) and the video quad derives from it (front face, UV
  corners).
- The video controls' state machine: no video → pick a file → playing (stop
  visible) → stop → cleared; `endRide` clears it; a non-video file is
  ignored.

Then: `studioScene.js` exports the screen box (the mesh uses it),
`view3d/videoScreen.js` (program, quad, texture upload, draw — GL code,
browser-verified only), `StudioView3D` draws it when a video is set,
`index.html` controls (`#studio-video`, `#studio-video-file`,
`#studio-video-stop`), `main.js` wiring.

## 5. i18n, docs, changelog

- `en.js`/`de.js`: `studio.classPick`, `video.startNow`, `studio.video`,
  `studio.videoStop`, `error.classUnknown` (wording checked against the
  existing keys' style).
- `docs/protocol.md`: `start_class` row, `class_unknown`, compatibility note
  (version stays 2).
- `CHANGELOG.md` `[Unreleased]` Added bullets; `docs/adr/0011` gets a
  short "on-demand classes" note (the ADR owns the studio's shape).

## 6. Verification and delivery

- `cd server && cargo test --workspace`; `cd client && npm run lint && node
  --test test/` (rustfmt/clippy when available).
- `make check` if the toolchain allows; report what could not run.
- Commit on `feat/workout-focus`, push, update draft PR #1 in place.
