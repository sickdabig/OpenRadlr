import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { wireClassPicker } from "../public/js/studio/classPicker.js";

const classes = [
  { id: "tempo", name: "Tempo Ride" },
  { id: "hiit", name: "HIIT 30/30" },
  { id: "climb-pyramid", name: "Climb Pyramid" },
  { id: "sweet-spot", name: "Sweet Spot" },
];

function fakeEl(tag = "div") {
  const listeners = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    textContent: "",
    value: "",
    disabled: false,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    append(...kids) {
      for (const kid of kids) (kid.parent = el), el.children.push(kid);
    },
    fire(type) {
      for (const fn of listeners.get(type) ?? []) fn({ target: el });
    },
  };
  return el;
}

const doc = fakeEl("document");
doc.createElement = (tag) => fakeEl(tag);

beforeEach(() => {
  globalThis.document = doc;
});

afterEach(() => {
  delete globalThis.document;
});

function picker(options = classes) {
  const select = fakeEl("select");
  const button = fakeEl("button");
  const started = [];
  wireClassPicker({ select, button, options, onStart: (id) => started.push(id) });
  return { select, button, started };
}

test("the picker lists the catalog's classes and starts the picked one", () => {
  const { select, button, started } = picker();
  assert.deepEqual(
    select.children.map((o) => [o.value, o.textContent]),
    classes.map((c) => [c.id, c.name]),
  );
  assert.equal(select.value, "", "nothing is picked until the rider picks");
  assert.equal(button.disabled, false);
  select.value = "sweet-spot";
  button.fire("click");
  assert.deepEqual(started, ["sweet-spot"]);
});

test("an empty catalog disables the controls", () => {
  const { select, button } = picker([]);
  assert.equal(select.children.length, 0);
  assert.equal(button.disabled, true);
  button.fire("click");
});
