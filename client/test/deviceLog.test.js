import { test } from "node:test";
import assert from "node:assert/strict";
import { DeviceLog } from "../public/js/ble/deviceLog.js";

test("the report states whether the browser could reach Web Bluetooth, and why not", () => {
  const log = new DeviceLog();
  assert.match(log.report({ webBluetooth: "unavailable: insecure origin (needs https or localhost)" }), /Web Bluetooth: unavailable: insecure origin \(needs https or localhost\)/);
  assert.match(new DeviceLog().report({ webBluetooth: "available" }), /Web Bluetooth: available/);
});

test("without an availability note the report stays as it was", () => {
  assert.doesNotMatch(new DeviceLog().report(), /Web Bluetooth/);
  const withEntries = new DeviceLog();
  withEntries.info("GATT connected");
  assert.match(withEntries.report(), /INFO GATT connected/);
});
