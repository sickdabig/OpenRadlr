/**
 * Reports browser crashes to the server (`POST /api/client-error`), so the
 * server console sees what its riders hit — the same errors the browser
 * console shows. Fire-and-forget: a failing report is dropped, never shown,
 * and reporting never throws into the app's own error handling.
 */

const MAX_REPORTS = 10;

/**
 * Hooks `error` and `unhandledrejection` on `target` (the browser's window).
 * @param {{target?: unknown, fetch?: typeof fetch}} [deps]
 * @returns {boolean} whether the hooks were installed
 */
export function installErrorReport({ target = globalThis.window, fetch: fetchFn = (...args) => globalThis.fetch(...args) } = {}) {
  if (!target || typeof target.addEventListener !== "function") return false;
  const seen = new Set();
  let sent = 0;
  const report = (kind) => (event) => {
    try {
      // A resource that failed to load fires `error` without a message; the
      // console noise is not worth a report.
      const message = kind === "unhandledrejection"
        ? String(event.reason?.message ?? event.reason ?? "unhandled rejection")
        : (event.message ?? null);
      if (message === null) return;
      // A repeating crash is one report; the cap bounds a broken page's noise.
      const key = `${kind}|${message}|${event.filename ?? ""}|${event.lineno ?? ""}`;
      if (sent >= MAX_REPORTS || seen.has(key)) return;
      seen.add(key);
      sent += 1;
      const body = { message, kind };
      if (event.filename) body.source = event.filename;
      if (event.lineno) body.line = event.lineno;
      if (event.colno) body.column = event.colno;
      const stack = event.error?.stack ?? event.reason?.stack;
      if (stack) body.stack = stack;
      fetchFn("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Reporting must never become the crash it reports.
    }
  };
  target.addEventListener("error", report("error"));
  target.addEventListener("unhandledrejection", report("unhandledrejection"));
  return true;
}
