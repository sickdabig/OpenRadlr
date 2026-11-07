import { test } from "node:test";
import assert from "node:assert/strict";
import { ServerBikeTrainer } from "../public/js/ble/serverBike.js";

/** A `bike` message as the server sends it. */
function bikemessage(overrides = {}) {
  return { type: "bike", connected: true, power: 150, cadence: 90, resistance: 23, distance_m: 1250, ...overrides };
}

test("a bike reading arrives as data for the ride", () => {
  const trainer = new ServerBikeTrainer({});
  const readings = [];
  trainer.on("data", (reading) => readings.push(reading));
  trainer.onBike(bikemessage());
  assert.deepEqual(readings, [{ power: 150, cadence: 90, resistance: 23, distance_m: 1250 }]);
});

test("the trainer is a power source the server cannot steer", async () => {
  const trainer = new ServerBikeTrainer({});
  assert.equal(trainer.connected, false);
  trainer.onBike(bikemessage());
  assert.equal(trainer.connected, true);
  // The S3's brake knob is mechanical: control calls answer, none has an effect.
  await trainer.setGrade(4.2);
  await trainer.setTargetPower(180);
  assert.equal(trainer.canControlResistance, false);
});

test("a quiet bike reads as connected zeros, a connection change is told", () => {
  const trainer = new ServerBikeTrainer({});
  const events = [];
  trainer.on("data", (reading) => events.push(["data", reading]));
  trainer.on("disconnected", () => events.push(["disconnected"]));
  trainer.on("reconnected", () => events.push(["reconnected"]));
  trainer.onBike(bikemessage({ connected: true, power: 0, cadence: 0, distance_m: 1250 }));
  trainer.onBike(bikemessage({ connected: false }));
  assert.deepEqual(events, [
    ["reconnected"],
    ["data", { power: 0, cadence: 0, resistance: 23, distance_m: 1250 }],
    ["disconnected"],
  ]);
  assert.equal(trainer.connected, false);
  trainer.onBike(bikemessage({ connected: true }));
  assert.deepEqual(events.at(-1), ["data", { power: 150, cadence: 90, resistance: 23, distance_m: 1250 }]);
  assert.equal(trainer.connected, true);
});

test("only bike messages count", () => {
  const trainer = new ServerBikeTrainer({});
  let readings = 0;
  trainer.on("data", () => readings++);
  trainer.onBike({ type: "state", tick: 1 });
  trainer.onBike(null);
  assert.equal(readings, 0);
});

test("the label names the bike on the server", () => {
  const trainer = new ServerBikeTrainer({ label: "Yesoul S3" });
  assert.equal(trainer.label, "Yesoul S3");
});
