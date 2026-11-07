import { test } from "node:test";
import assert from "node:assert/strict";
import { DeviceLog } from "../public/js/ble/deviceLog.js";

test("the report lists user agent and packet counters", () => {
  const log = new DeviceLog();
  log.count("hr");
  assert.match(log.report({ userAgent: "test" }), /User agent: test/);
  assert.match(log.report(), /Packets: {"hr":1}/);
});

test("without entries the report is just the header", () => {
  assert.doesNotMatch(new DeviceLog().report(), /INFO|ERROR|PACKET/);
  const withEntries = new DeviceLog();
  withEntries.info("GATT connected");
  assert.match(withEntries.report(), /INFO GATT connected/);
});
