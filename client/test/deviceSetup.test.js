import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseRideMode, liveCheck, rideModes } from "../public/js/view/deviceSetup.js";

const road = { id: "col" };
const studio = { id: "spin-studio", kind: "studio" };
const ids = (modes) => modes.map((mode) => mode.id);

test("the ways to ride: the server's bike, phone paddles and the simulator, as far as the server allows", () => {
  assert.deepEqual(ids(rideModes({ info: { bike: { kind: "yesoul" } }, picked: road })), ["trainer", "paddles", "sim"]);
  assert.deepEqual(ids(rideModes({ info: { bike: { kind: "yesoul" }, paddle_mode: false }, picked: road })), ["trainer", "sim"]);
  assert.deepEqual(ids(rideModes({ info: { bike: { kind: "yesoul" }, simulated_trainer: false }, picked: road })), ["trainer", "paddles"]);
  assert.deepEqual(ids(rideModes({ info: null, picked: null })), ["paddles", "sim"], "no bike reported, no trainer mode");
});

test("the trainer mode is the server's own bike, with its hint", () => {
  const modes = rideModes({ info: { bike: { kind: "yesoul" } }, picked: road });
  assert.equal(modes[0].label, "Server's bike");
  assert.equal(modes[0].hint, "The server's Bluetooth");
  assert.equal(modes[0].available, true);
});

test("phone paddles ride the roads only: in the studio they're offered but unavailable, with the reason", () => {
  const paddles = rideModes({ info: { bike: { kind: "yesoul" } }, picked: studio }).find((mode) => mode.id === "paddles");
  assert.equal(paddles.available, false);
  assert.match(paddles.reason, /trainer/);
  assert.equal(rideModes({ info: { bike: { kind: "yesoul" } }, picked: road }).find((mode) => mode.id === "paddles").available, true);
});

test("the remembered way to ride is kept while it's available", () => {
  const modes = rideModes({ info: { bike: { kind: "yesoul" } }, picked: road });
  assert.equal(chooseRideMode("paddles", modes), "paddles");
  assert.equal(chooseRideMode("sim", modes), "sim");
});

test("without a choice: the server's bike, else phone paddles, else the simulator", () => {
  const modes = rideModes({ info: { bike: { kind: "yesoul" } }, picked: road });
  assert.equal(chooseRideMode(null, modes), "trainer");
  assert.equal(chooseRideMode(null, rideModes({ info: null, picked: road })), "paddles");
  assert.equal(chooseRideMode(null, rideModes({ info: { paddle_mode: false }, picked: road })), "sim");
  assert.equal(chooseRideMode(null, rideModes({ info: { paddle_mode: false, simulated_trainer: false }, picked: road })), null);
});

test("a remembered choice that isn't available here falls back like no choice", () => {
  assert.equal(chooseRideMode("trainer", rideModes({ info: null, picked: road })), "paddles");
  assert.equal(chooseRideMode("paddles", rideModes({ info: { bike: { kind: "yesoul" } }, picked: studio })), "trainer", "in the studio the server bike takes over");
  assert.equal(chooseRideMode("sim", rideModes({ info: { simulated_trainer: false }, picked: road })), "paddles", "no bike reported, so paddles take over");
  assert.equal(chooseRideMode("bogus", rideModes({ info: { bike: { kind: "yesoul" } }, picked: road })), "trainer");
});

test("the live check: waiting, connected and still, the numbers once power flows, a hint when data stops", () => {
  assert.deepEqual(liveCheck({ sinceDataMs: null }), { state: "waiting", text: "Connected · waiting for data…" });
  assert.deepEqual(liveCheck({ sinceDataMs: 200, power: 0, cadence: 0 }), { state: "idle", text: "Connected · pedal to check" });
  assert.deepEqual(liveCheck({ sinceDataMs: 200, power: 182.4, cadence: 88 }), { state: "live", text: "✓ 182 W · 88 rpm" });
  assert.deepEqual(liveCheck({ sinceDataMs: 200, power: 150 }), { state: "live", text: "✓ 150 W · – rpm" });
  const silent = liveCheck({ sinceDataMs: 7_400, power: 182 });
  assert.equal(silent.state, "silent");
  assert.match(silent.text, /No data for 7 s/);
});
