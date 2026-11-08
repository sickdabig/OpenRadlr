// Starts the real server binary for the headless browser tests.
//
// The binary must be built first (`make build-server` or
// `cargo build --bin openradlr-server` in `server/`); the tests fail with a
// clear message when it is missing. The server gets a temp data dir and a
// random port, so runs never touch a real rider's data.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const serverBin = path.join(repoRoot, "server", "target", "debug", "openradlr-server");

/**
 * Starts the server; resolves once `/healthz` answers.
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
export async function startServer() {
  if (!existsSync(serverBin)) {
    throw new Error(`the server binary is missing at ${serverBin} — build it first: make build-server`);
  }
  const port = 20000 + Math.floor(Math.random() * 20000);
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "openradlr-e2e-"));
  const child = spawn(serverBin, {
    env: {
      ...process.env,
      OPENRADLR_BIND: `127.0.0.1:${port}`,
      OPENRADLR_STATIC_DIR: path.join(repoRoot, "client", "public"),
      OPENRADLR_ROUTE_FILE: path.join(repoRoot, "routes", "rolling-hills.json"),
      OPENRADLR_DATA_DIR: dataDir,
      RUST_LOG: "warn",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) throw new Error(`the test server exited with code ${code}`);
    if (signal) throw new Error(`the test server died from ${signal}`);
  });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (true) {
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) return { url, stop: () => child.kill("SIGTERM") };
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error("the test server did not answer /healthz within 20 s");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
