import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(here, "..", "public", "sw.js"), "utf8");

// Evaluates sw.js with fakes for self/caches/fetch, like the browser would,
// and returns the fetch listeners plus the cache store used by the test.
function loadServiceWorker({ store, fetchImpl }) {
  const listeners = { fetch: [] };
  const context = {
    self: {
      location: { origin: "http://localhost:7777" },
      addEventListener: (type, listener) => (listeners[type] ??= []).push(listener),
    },
    caches: {
      open: async () => ({
        put: async (request, response) => {
          store.set(keyOf(request), response);
        },
      }),
      match: async (key) => store.get(keyOf(key)),
      keys: () => [],
      delete: () => {},
    },
    fetch: fetchImpl,
    URL,
    Request,
    Response,
    console,
  };
  vm.runInNewContext(SOURCE, context, { filename: "sw.js" });
  return listeners;
}

const keyOf = (key) => {
  if (typeof key === "string") return key.startsWith("http") ? new URL(key).pathname : key;
  return new URL(key.url).pathname;
};

// Registers the listeners and lets the fetch handler populate respondWith.
function runFetch(listeners, request) {
  let responded;
  const event = {
    request,
    waitUntil() {},
    respondWith: (promise) => {
      responded = promise;
    },
  };
  for (const listener of listeners.fetch) listener(event);
  return responded;
}

const indexShell = () => new Response("<html>OpenRadlr shell</html>", { headers: { "content-type": "text/html" } });

test("an offline navigation falls back to the cached index shell", async () => {
  const store = new Map([["/index.html", indexShell()]]);
  const listeners = loadServiceWorker({ store, fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) });
  // Only real page navigations carry mode "navigate"; the Request constructor
  // cannot set it, so the test poses as one.
  const request = new Request("http://localhost:7777/");
  Object.defineProperty(request, "mode", { value: "navigate" });
  const responded = runFetch(listeners, request);
  const response = await responded;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<html>OpenRadlr shell</html>");
});

test("an offline module script fails instead of being served the index shell", async () => {
  const store = new Map([["/index.html", indexShell()]]);
  const listeners = loadServiceWorker({ store, fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) });
  const responded = runFetch(listeners, new Request("http://localhost:7777/js/net/socket.js"));
  await assert.rejects(responded, TypeError);
});

test("an online module script passes through and lands in the cache", async () => {
  const store = new Map();
  const listeners = loadServiceWorker({
    store,
    fetchImpl: () => Promise.resolve(new Response("export {};", { headers: { "content-type": "text/javascript" } })),
  });
  const responded = runFetch(listeners, new Request("http://localhost:7777/js/net/socket.js"));
  const response = await responded;
  assert.equal(await response.text(), "export {};");
  assert.ok(store.has("/js/net/socket.js"));
});

test("live endpoints are never intercepted", () => {
  const store = new Map([["/index.html", indexShell()]]);
  const fetchImpl = () => {
    throw new Error("the service worker must bypass /api requests");
  };
  const listeners = loadServiceWorker({ store, fetchImpl });
  const responded = runFetch(listeners, new Request("http://localhost:7777/api/info"));
  assert.equal(responded, undefined);
});
