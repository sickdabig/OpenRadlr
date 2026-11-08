# Structured workout library on the start menu — implementation plan

Spec: `docs/superpowers/specs/2026-11-09-workout-library-design.md`
Branch: `feat/workout-focus` (from `feat/yesoul-s3-server-ble`). Client only —
no server change, no protocol change.

## Steps (each lands with its tests)

1. **Pure helpers** — `view/workoutLibraryView.js`: `workoutStrip` (segments as
   zone-coloured fractions via `zoneFor`/`ZONE_COLORS`), `libraryCard` (name,
   minutes, description, strip), `renderWorkoutLibrary` (radio cards,
   textContent only, arrow keys, selection fallback, import callback).
   Failing tests in `client/test/workoutLibrary.test.js` first.
2. **Start menu** — `view/startMenu.js`: the training card in `routesOf`,
   `activityOf`, `activityTabs`, `stageHeadline`, `stageLede`,
   `stageStats(picked, workouts, nowS)`, `joinAction` ("Start workout",
   boarding ignored), `devicesVisible` stays true. Tests in
   `startMenu.test.js` first.
3. **Profile** — `profile/profileStore.js`: `DEFAULT_PROFILE` gains
   `trainingPick: null` and `workouts: []`; save/load round-trip, a corrupt
   stored workout is dropped. Tests first.
4. **Wiring** — `main.js`: `app.workouts` = presets + validated imports;
   `initTrainingSetup` (library, import with the 512 KB cap and notes);
   `renderStartMenu` shows the fieldset on the tab; `joinRide` resolves the
   training card to the default route and remembers `app.pendingWorkout`;
   `startRoad` starts it once the training panel is wired; the typed vehicle
   code is ignored on the tab. `index.html` fieldset after `workout-setup`.
5. **i18n** — en + de: `menu.training`, `menu.tab.training`,
   `menu.stage.pickTraining`, `menu.training.lede`, `menu.join.training`,
   `training.library`; the import reuses `drawer.importZwo`,
   `training.imported`, `training.importFailed`, the stats line reuses
   `menu.workouts`. Parity and sweep tests gate them.
6. **Docs** — CHANGELOG under `[Unreleased]`, README client bullet.
7. **Verify** — `make check` (lint + all client tests + cargo workspace).
   A live ride on the host: pick a workout on the tab, ride, confirm the
   warm-up runs from the join and the in-ride dropdown lists imports.

## Notes

- The pick is remembered by workout name (`profile.trainingPick`); an unknown
  saved name falls back to the first card, like the café pick's unknown id.
- Imports are capped at 25 stored workouts; `createWorkout` already caps
  segments and duration, so a bloated file cannot blow the storage.
- The in-ride picker and the library share `app.workouts` — one list, two
  views; an import re-renders both.
- ERG needs a controllable trainer; the server's Yesoul S3 (power-only) and
  paddles run the workout guided, exactly as the studio class does.
