// Headless browser tests: the real client against the real server, in
// Chromium. These catch what the unit tests cannot — a module that fails to
// load, a top-level crash (the browser reports it to the server with
// `POST /api/client-error`), or a ride that never starts. The bike is not
// available here, so the rides run on the simulator, the same power source a
// rider without a trainer uses.
//
// Build the server first (`make test-e2e` does it), and once install
// Chromium: `npx playwright install chromium`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { chromium } from "playwright";

import { startServer } from "./server.mjs";

let server;
let browser;

before(async () => {
  server = await startServer();
  browser = await chromium.launch({ headless: true });
});

after(() => {
  browser?.close();
  server?.stop();
});

/** A page with every failure channel wired to an array the test can assert on. */
async function watchedPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = { pageErrors: [], consoleErrors: [], failedRequests: [], badResponses: [], clientErrorReports: [] };
  page.on("pageerror", (error) => problems.pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") problems.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => problems.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.badResponses.push(`${response.status()} ${response.url()}`);
    if (response.url().endsWith("/api/client-error")) problems.clientErrorReports.push(response.url());
  });
  return { page, problems };
}

/** Fills the rider form and picks the simulator as the power source. */
async function pickSimulator(page) {
  await page.fill("#name", "E2E Rider");
  await page.fill("#weight", "75");
  await page.fill("#ftp", "200");
  await page.click("#use-simulated");
}

test("the start page loads every asset without an error", async () => {
  const { page, problems } = await watchedPage();
  await page.goto(server.url);
  await page.waitForSelector("#route-list .route-card", { timeout: 15_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  assert.deepEqual(problems.pageErrors, []);
  assert.deepEqual(problems.consoleErrors, []);
  assert.deepEqual(problems.failedRequests, []);
  assert.deepEqual(problems.badResponses, []);
  assert.deepEqual(problems.clientErrorReports, []);
  await page.close();
});

test("a ride starts on the simulator and the rider moves", async () => {
  const { page, problems } = await watchedPage();
  await page.goto(server.url);
  await page.waitForSelector("#route-list .route-card", { timeout: 15_000 });
  await pickSimulator(page);
  await page.click("#join");
  await page.waitForSelector("#ride", { state: "visible", timeout: 15_000 });
  // The simulator pedals at once: power and speed come up, distance grows.
  await page.waitForFunction(() => {
    const power = document.querySelector('#ride [data-m="power"]');
    return power !== null && Number(power.textContent) > 0;
  }, { timeout: 15_000 });
  await page.waitForFunction(() => {
    const speed = document.querySelector('#ride [data-m="speed"]');
    return speed !== null && Number(speed.textContent) > 0;
  }, { timeout: 15_000 });
  assert.deepEqual(problems.pageErrors, []);
  assert.deepEqual(problems.consoleErrors, []);
  assert.deepEqual(problems.failedRequests, []);
  assert.deepEqual(problems.badResponses, []);
  assert.deepEqual(problems.clientErrorReports, []);
  await page.close();
});

test("a structured workout starts from the library and runs", async () => {
  const { page, problems } = await watchedPage();
  await page.goto(server.url);
  await page.waitForSelector("#route-list .route-card", { timeout: 15_000 });
  await pickSimulator(page);
  // The library is the menu's last card (routes, studio, workout, training).
  await page.click("#route-list .route-card:last-child");
  await page.waitForSelector("#training-setup", { state: "visible", timeout: 10_000 });
  await page.click("#training-cards .workout-card");
  await page.click("#join");
  await page.waitForSelector("#ride", { state: "visible", timeout: 15_000 });
  await page.waitForSelector("#workout-hud", { state: "visible", timeout: 15_000 });
  // The workout clock waits for pedalling; the simulator pedals at once, so
  // the warm-up block counts down.
  await page.waitForFunction(() => {
    const left = document.querySelector("#workout-block-time")?.textContent ?? "";
    return /\d/.test(left);
  }, { timeout: 15_000 });
  assert.deepEqual(problems.pageErrors, []);
  assert.deepEqual(problems.consoleErrors, []);
  assert.deepEqual(problems.failedRequests, []);
  assert.deepEqual(problems.badResponses, []);
  assert.deepEqual(problems.clientErrorReports, []);
  await page.close();
});
