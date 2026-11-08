import { test } from "node:test";
import assert from "node:assert/strict";
import { installErrorReport } from "../public/js/net/errorReport.js";

function fakeTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    fire(type, event) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

function fakeFetch() {
  const calls = [];
  const fetch = (url, options) => {
    calls.push({ url, options });
    return Promise.resolve({ ok: true, status: 204 });
  };
  fetch.calls = calls;
  return fetch;
}

test("errors and unhandled rejections are posted to the server", () => {
  const target = fakeTarget();
  const fetch = fakeFetch();
  assert.equal(installErrorReport({ target, fetch }), true);

  target.fire("error", {
    message: "Cannot access 'X' before initialization",
    filename: "http://host/js/main.js",
    lineno: 679,
    colno: 57,
    error: { stack: "at savedWorkouts (main.js:679)" },
  });

  const [call] = fetch.calls;
  assert.equal(call.url, "/api/client-error");
  assert.equal(call.options.method, "POST");
  const body = JSON.parse(call.options.body);
  assert.equal(body.message, "Cannot access 'X' before initialization");
  assert.equal(body.kind, "error");
  assert.equal(body.source, "http://host/js/main.js");
  assert.equal(body.line, 679);
  assert.equal(body.column, 57);
  assert.equal(body.stack, "at savedWorkouts (main.js:679)");

  target.fire("unhandledrejection", { reason: new TypeError("boom") });
  const rejection = JSON.parse(fetch.calls[1].options.body);
  assert.equal(rejection.kind, "unhandledrejection");
  assert.equal(rejection.message, "boom");
});

test("a repeating message is reported once", () => {
  const target = fakeTarget();
  const fetch = fakeFetch();
  installErrorReport({ target, fetch });

  const event = { message: "same again", filename: "main.js", lineno: 1 };
  target.fire("error", event);
  target.fire("error", event);
  target.fire("error", event);

  assert.equal(fetch.calls.length, 1);
});

test("reports stop after the cap, so a broken page cannot flood the server", () => {
  const target = fakeTarget();
  const fetch = fakeFetch();
  installErrorReport({ target, fetch });

  for (let index = 0; index < 25; index++) {
    target.fire("error", { message: `crash ${index}` });
  }

  assert.equal(fetch.calls.length, 10);
});

test("without a window to hook nothing is installed", () => {
  assert.equal(installErrorReport({ target: null, fetch: fakeFetch() }), false);
});

test("a fetch that fails is swallowed, never thrown into the app", () => {
  const target = fakeTarget();
  const fetch = () => Promise.reject(new Error("server gone"));
  installErrorReport({ target, fetch });
  assert.doesNotThrow(() => target.fire("error", { message: "boom" }));
});
