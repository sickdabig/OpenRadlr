import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setLocale } from "../public/js/i18n/i18n.js";
import { PRESET_WORKOUTS, createWorkout, intervals, ramp, steady } from "../public/js/ride/workout.js";
import { ZONE_COLORS } from "../public/js/view/workoutView.js";
import { libraryCard, workoutStrip, renderWorkoutLibrary } from "../public/js/view/workoutLibraryView.js";

const sweetSpot = PRESET_WORKOUTS[1];

function fakeEl(tag = "div") {
  const listeners = new Map();
  const attrs = new Map();
  const el = {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], parent: null, textContent: "", className: "", title: "", tabIndex: 0,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    append(...kids) { for (const kid of kids) { kid.parent = el; el.children.push(kid); } },
    replaceChildren(...kids) { el.children = []; el.append(...kids); },
    contains(other) { for (let node = other; node; node = node.parent) if (node === el) return true; return false; },
    focus() { doc.activeElement = el; },
    fire(type, event = {}) { for (const fn of listeners.get(type) ?? []) fn({ target: el, preventDefault() {}, stopPropagation() {}, ...event }); },
    all() { return el.children.flatMap((kid) => [kid, ...kid.all()]); },
  };
  return el;
}

const doc = fakeEl("document");
doc.createElement = (tag) => fakeEl(tag);

beforeEach(() => {
  doc.activeElement = null;
  globalThis.document = doc;
});
afterEach(() => {
  setLocale("en");
  delete globalThis.document;
});

function draw(options = {}) {
  const container = fakeEl();
  const calls = { select: [] };
  const render = (extra = {}) =>
    renderWorkoutLibrary(container, [PRESET_WORKOUTS[0], sweetSpot, PRESET_WORKOUTS[2]], {
      selectedName: "Endurance 45",
      onSelect: (name) => calls.select.push(name),
      ...options, ...extra,
    });
  render();
  const radios = () => container.all().filter((el) => el.getAttribute("role") === "radio");
  return { container, calls, render, radios };
}

test("the strip has one segment per block, as fractions of the whole, with its zone colour", () => {
  const strip = workoutStrip(sweetSpot);
  assert.equal(strip.length, 8);
  assert.ok(Math.abs(strip.reduce((sum, s) => sum + s.fraction, 0) - 1) < 1e-9);
  const warmup = strip[0];
  assert.equal(warmup.zone, 2);
  assert.equal(warmup.color, ZONE_COLORS[1]);
  const interval = strip[1];
  assert.equal(interval.zone, 3);
  assert.equal(interval.color, ZONE_COLORS[2]);
  assert.equal(strip.at(-1).zone, 1);
});

test("a card names the workout, its minutes and description", () => {
  const card = libraryCard(sweetSpot);
  assert.equal(card.name, "Sweet Spot 3×8");
  assert.equal(card.minutes, 51);
  assert.equal(card.description, "Three 8-minute blocks just below threshold.");
  assert.ok(card.strip.length > 0);
});

test("an imported workout keeps its own name and description", () => {
  const imported = createWorkout({ name: "My file", description: "From a .zwo", segments: [steady(600, 0.6)] });
  const card = libraryCard(imported);
  assert.deepEqual([card.name, card.description, card.minutes], ["My file", "From a .zwo", 10]);
});

test("the selected card is checked; an unknown saved name falls back to the first", () => {
  const { radios, render } = draw();
  assert.deepEqual(radios().map((r) => r.getAttribute("aria-checked")), ["true", "false", "false"]);
  render({ selectedName: "gone" });
  assert.deepEqual(radios().map((r) => r.getAttribute("aria-checked")), ["true", "false", "false"]);
  render({ selectedName: null });
  assert.equal(radios()[0].getAttribute("aria-checked"), "true");
});

test("clicking a card selects it by name; arrow keys move in library order and wrap", () => {
  const { radios, calls } = draw({ selectedName: "Endurance 45" });
  radios()[2].fire("click");
  radios()[0].fire("keydown", { key: "ArrowRight" });
  radios()[0].fire("keydown", { key: "ArrowLeft" });
  radios()[1].fire("keydown", { key: "ArrowDown" });
  assert.deepEqual(calls.select, ["VO2max 5×3", "Sweet Spot 3×8", "VO2max 5×3", "VO2max 5×3"]);
});

test("only the selected card is in the tab order", () => {
  const { radios } = draw({ selectedName: "Sweet Spot 3×8" });
  assert.deepEqual(radios().map((r) => r.tabIndex), [-1, 0, -1]);
});

test("cards show the name, minutes and description as text", () => {
  const { container } = draw();
  const texts = container.all().map((el) => el.textContent);
  assert.ok(texts.includes("Endurance 45"));
  assert.ok(texts.includes("45 min"));
  assert.ok(texts.includes("Steady aerobic ride with a short build."));
});

test("a strip segment names its block and length, in the active language", () => {
  const { container, render } = draw();
  assert.match(container.all().find((el) => el.dataset.segment === "0").title, /Warm-up/);
  setLocale("de");
  render();
  assert.match(container.all().find((el) => el.dataset.segment === "0").title, /Aufwärmen/);
});

test("the library reads its lengths and zones off the workout, not off the rider", () => {
  const long = createWorkout({ name: "Long", segments: [ramp(1200, 0.4, 0.7, "Warm-up", "warmup"), ...intervals(2, 1800, 0.95, 600, 0.5)] });
  const card = libraryCard(long);
  assert.equal(card.minutes, 100);
  assert.equal(card.strip[1].zone, 4);
});
