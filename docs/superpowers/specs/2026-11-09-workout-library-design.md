# Structured workout library on the start menu — design

Date: 2026-11-09 · Status: agreed with the operator

## Goal

A rider whose main use of OpenRadlr is structured training rides alone and
wants to start a workout whenever they are ready, not when the next studio
class or scheduled event begins. Today the four ERG presets and `.zwo`
imports hide behind a small dropdown on the ride menu's Training page, after
the ride has already joined; the only on-schedule structured option is the
spin studio. The start menu gains a **Training** tab with a workout library:
pick a structured workout, click Ride, and the ride joins a road with the
workout already running from its first block.

## Decisions

| Question | Decision |
| --- | --- |
| Where it lives | A new start-menu activity card `{ id: "training", kind: "training" }` in `routesOf`, following the café-workout pattern: a client-side pseudo-route, no server change |
| Where it rides | The server's default (first) route, like the café workout's world; solo or with whoever is out there — a workout changes nothing about the road |
| The library | Every structured workout in one picker: the four presets plus imported ones. Cards with name, duration, description and a zone-coloured segment strip (`zoneFor` → `ZONE_COLORS`) |
| Imports persist | Imported `.zwo` workouts are stored in the profile (`profile.workouts`, capped at 25), validated with `createWorkout` on load — the library survives reloads, and the in-ride Training page's dropdown gains them too |
| The pick | Remembered by workout name in `profile.trainingPick` (names are the only stable key; an unknown saved name falls back to the first card) |
| Trainer | Whatever the rider rides with: the workout needs no device of its own, so the ride-mode cards stay. ERG holds the target on a controllable trainer; a power-only one runs the workout guided (targets shown, resistance unchanged) — `TrainingControl.startWorkout` already decides |
| Start | The Ride button reads "Start workout" (`menu.join.training`) and joins like any road ride; `joinRide` resolves the training card to the default route and remembers `app.pendingWorkout`; `startRoad` starts it once the training panel is wired, so block 1 (the warm-up) runs from the first telemetry tick (the clock waits for pedalling) |
| Boarding | A typed vehicle code is ignored on the training tab, like on the café workout: boarding a tandem mid-interval makes no sense |
| UI text | Through the i18n module (en + de); the import button and notes reuse the existing `drawer.importZwo` / `training.imported` / `training.importFailed` keys |
| Out of scope | A workout editor, workout search or tags, pace targets (grade control), syncing the library across browsers |

## Why a separate tab instead of the Ride tab's route cards

The activity model already splits the start menu by what the rider does
there (ride, studio class, café workout, events), and `stageHeadline` /
`stageLede` give each tab its own introduction. A fifth card among the routes
would bury the one thing this rider opens the app for; the tab puts the
library one click from launch. The card itself is a pseudo-route exactly like
the café workout's, so `joinAction`, `activityOf` and the tab list need one
entry each and nothing else changes about the join.

## Client

- `view/workoutLibraryView.js`: pure helpers (`workoutStrip`, `libraryCard`)
  and `renderWorkoutLibrary(container, workouts, …)` — a radio group written
  with `textContent` only (names can come from a file), keyboard arrows like
  the café cards.
- `view/startMenu.js`: the training card in `routesOf`, its tab, headline,
  lede and stats line (`workoutTagline` over the whole library), the
  "Start workout" join label, and boarding ignored on the tab.
- `profile/profileStore.js`: `DEFAULT_PROFILE` gains `trainingPick: null`
  and `workouts: []`; both survive `keepValid` (unknown keys pass through).
- `main.js`: `app.workouts` = presets + validated saved imports;
  `initTrainingSetup` renders the library and wires the import (file input,
  size cap, notes); `renderStartMenu` shows the fieldset on the tab;
  `joinRide` keeps `app.pendingWorkout`; `startRoad` starts it and notifies.
- In-ride Training page unchanged: its dropdown reads `app.workouts`, so
  imported workouts appear there too.

## Testing

- `workoutLibrary.test.js`: card data (name, minutes, description, strip
  zones and colours), render (radios, selection fallback, arrow keys, import
  callback, textContent only).
- `startMenu.test.js`: the training card follows the workout card, its
  headline, lede, stats line, join label, boarding ignored, devices visible.
- `profileFtp.test.js`-style: `workouts` and `trainingPick` round-trip
  through save/load; a corrupt stored workout is dropped, not fatal.
- `make check` green; the i18n parity/sweep tests gate every new key.

## Docs

- `docs/superpowers/` — this spec and the implementation plan.
- `CHANGELOG.md` under `[Unreleased]` → Added.
- README: the client bullet mentions the start menu's workout library.
