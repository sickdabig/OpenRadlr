/**
 * Start menu: how the rider rides (the server's own bike, phone paddles or
 * the simulator). Pure helpers only; main.js connects the devices.
 */

import { t } from "../i18n/i18n.js";

/** Label, hint and the hint's relocalisation key, per mode. */
const modeText = () => ({
  trainer: { label: t("setup.mode.serverBike"), hint: t("setup.mode.serverBikeHint"), hintKey: "setup.mode.serverBikeHint" },
  paddles: { label: t("setup.mode.paddles"), hint: t("setup.mode.paddlesHint"), hintKey: "setup.mode.paddlesHint" },
  sim: { label: t("setup.mode.sim"), hint: t("setup.mode.simHint"), hintKey: "setup.mode.simHint" },
});

/**
 * The ways to ride this server allows for the picked card. The trainer mode is
 * the bike the server itself is connected to, so it only exists when the server
 * offers one. Paddles stay listed in the studio, unavailable with the reason,
 * so the choice doesn't vanish from under the rider.
 * @returns {{id: string, label: string, hint: string, hintKey: string, available: boolean, reason: string}[]}
 */
export function rideModes({ info, picked }) {
  const ids = [];
  if (info?.bike) ids.push("trainer");
  if (info?.paddle_mode !== false) ids.push("paddles");
  if (info?.simulated_trainer !== false) ids.push("sim");
  return ids.map((id) => {
    const unavailable = id === "paddles" && picked?.kind === "studio";
    return { id, ...modeText()[id], available: !unavailable, reason: unavailable ? t("setup.studioNeedsTrainer") : "" };
  });
}

/** The remembered way to ride while it's available, else the server's bike, phone paddles, the simulator. */
export function chooseRideMode(saved, modes) {
  const usable = (id) => modes.some((mode) => mode.id === id && mode.available);
  if (usable(saved)) return saved;
  return ["trainer", "paddles", "sim"].find(usable) ?? null;
}

/** After this long without a packet the trainer is probably asleep or taken by another app. */
export const SILENT_AFTER_MS = 5000;

/**
 * The live check under the trainer: is data arriving, and is it real?
 * `sinceDataMs`: time since the last packet (null: none yet).
 * @returns {{state: "waiting" | "idle" | "live" | "silent", text: string}}
 */
export function liveCheck({ sinceDataMs, power, cadence }) {
  if (sinceDataMs === null || sinceDataMs === undefined) return { state: "waiting", text: t("setup.live.waiting") };
  if (sinceDataMs > SILENT_AFTER_MS) return { state: "silent", text: t("setup.live.silent", { s: Math.floor(sinceDataMs / 1000) }) };
  if (power > 0) return { state: "live", text: `✓ ${Math.round(power)} W · ${Number.isFinite(cadence) ? Math.round(cadence) : "–"} rpm` };
  return { state: "idle", text: t("setup.live.idle") };
}
