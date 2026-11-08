# On-demand studio classes and a video on the studio's screen

Date: 2026-11-09 · Status: accepted · Follows: ADR 0011 (spin studio), workout-library spec

## Goal

The studio's classes run on a rolling 30-minute timetable: to ride "Climb
Pyramid" you wait for its slot. Riding alone, that waiting is pointless. Two
additions:

1. **Start a class when you want.** Pick any class from the studio's catalog
   and start it now, in your room — no waiting for the timetable.
2. **Watch a video on the big screen.** The studio's front wall has a big
   screen (a dark mesh today). Play the rider's own video on it during the
   class.

## Decisions

| # | Decision | Why / alternatives |
| --- | --- | --- |
| 1 | The practice class gets a **per-room clock** anchored at the start moment, on the server (`Studio::start_class(room, class_id)`, `Studio::clock_of(room)`). Other rooms keep the rolling timetable. | Bots, targets and the board are server-side; a client-side clock would desynchronise them (the coach's call-outs, the board's "on target"). A second `Studio` instance per practice would fork the room state. |
| 2 | A practice class **starts at once, no lobby** (`elapsed_s` begins at 0). | The point is "start when I want"; every class opens with a warm-up, which is the ramp-in. |
| 3 | When the practice class ends, the room **returns to the rolling timetable** and its board scores reset. | The timetable stays the source of truth; a finished class must not freeze the room on a stale clock. |
| 4 | Starting a class **resets the room's board scores** (time on target, kJ). | The board measures one class; a new class is a new board. |
| 5 | New client→server message **`start_class { class_id }`**. Additive: old clients never send it, old servers ignore it (`unknown type`), so `PROTOCOL_VERSION` stays 2. | The pattern of `create_vehicle`/`pause` (both added within version 2). |
| 6 | An unknown `class_id` answers **`error` with code `class_unknown`**; the room's class is unchanged. | The pattern of `unknown_exercise` (#77). |
| 7 | `start_class` is **per room**: the sender's room rides the picked class; whoever joins that room later rides along. Any rider in a room may start a class for it (the same trust model as `start_race`). | Rooms are the studio's unit of state; per-rider clocks would need a room per rider. |
| 8 | The picker lives **in the studio panel** (in ride), not the start menu. | Starting a class needs a seat; a pre-join picker would need pending state like the training ride's, plus a "what if someone else started one" path. Join studio → pick → start is two clicks. |
| 9 | The video is the **rider's own file** (file picker → object URL), muted, looping, browser-only. No upload, no bundled media (licensing), no URLs for now (CORS on texture upload; a follow-up). | The rider chooses the content; the server never sees it. |
| 10 | The video is a **WebGL texture on the screen's front face**, not a DOM overlay. | The coach stands between the camera and the screen; a DOM `<video>` over the canvas would cover riders. A texture gets depth testing for free. |
| 11 | The screen's geometry lives in **one place** (`studioScene.js` exports the screen box); the video quad derives from it. | Mesh and texture must not drift apart. |
| 12 | The video **loops on its own** and does not restart when a class starts. | A follow-up if wanted; nothing in the class clock needs it. |
| 13 | The video controls live in the **studio controls** row: a "Video" button (opens the picker) and, while a video plays, a stop button. The ride's end clears the video. | The video only means anything in the studio; `endRide` is where per-ride state resets. |

## Server changes

- `openradlr_sim::studio`: private `Practice { class_index, starts_at_s }` per
  room, kept parallel to `rooms` (dropped with its room). `start_class`
  validates the class id, anchors the clock, resets the room's scores.
  `clock_of(room)` returns the practice clock while it runs (expired ones are
  ignored; `tick` drops them and resets the scores). `tick` computes targets
  and cues per room; a global slot rollover no longer resets a room that is
  riding a practice class.
- `server` crate: `ClientMessage::StartClass`, `Command::StartClass`,
  `Game::start_class` (default: nothing), `StudioCore::start_class` (anchor +
  immediate `studio_state` to the room, `class_unknown` on a bad id).
  `studio_state_message` reports the rider's room's clock.
- `docs/protocol.md`: `start_class` row, `class_unknown` error, compatibility
  note. Version stays 2.

## Client changes

- `net/protocol.js` + `net/connection.js`: `startClass(classId)`.
- `index.html`: a class picker (`select` + "Start now" button) in the studio
  panel; a "Video" button, a hidden file input and a stop button in the
  studio controls.
- `view3d/videoScreen.js` (new): its own shader program (textured quad),
  texture upload from a `<video>` element, draw at the screen's front face.
  `studioScene.js` exports the screen box; `StudioView3D` draws the video
  when one is loaded.
- `main.js`: populate the picker from the `/api/studio` catalog, send
  `start_class`, wire the video picker/stop, clear both on `endRide`.

## i18n

New keys in `en.js` and `de.js` (parity and sweep tests gate them): the
picker's label, "Start now", the video button, the stop button, the
`class_unknown` error line.

## Testing

- `sim`: `start_class` anchors the room's clock; the room's bots chase the
  practice class while the timetable is elsewhere; scores reset at start and
  at the end; the room returns to the timetable; unknown class/room → `false`;
  a global slot rollover leaves a practicing room's scores alone.
- `server`: `start_class` from a rider switches their room's `studio_state`
  to the picked class at once; an unknown id answers `class_unknown`; other
  games ignore `start_class`.
- Client: message builders, the picker's options and start action, the video
  controls' states (picker → playing → stopped, cleared on `endRide`), i18n
  parity. The GL draw itself is exercised by the browser only (as with the
  rest of `view3d`).
