import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { clientDevices } from "../public/js/view/startMenu.js";
import { setLocale } from "../public/js/i18n/i18n.js";

afterEach(() => setLocale("en"));

test("clientDevices: a server without a bike always lets riders bring devices; a bike server says no unless told otherwise", () => {
  // No info yet (the menu's first paint): full UI, nothing collapses.
  assert.equal(clientDevices(undefined), true);
  const bikeless = { simulated_trainer: true };
  assert.equal(clientDevices(bikeless), true);
  // A bike offered: the standard server hides the browser device UX.
  assert.equal(clientDevices({ bike: { kind: "yesoul" } }), false);
  assert.equal(clientDevices({ bike: { kind: "yesoul" }, client_devices: false }), false);
  // The operator's escape hatch.
  assert.equal(clientDevices({ bike: { kind: "yesoul" }, client_devices: true }), true);
});
