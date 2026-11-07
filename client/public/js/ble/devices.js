/**
 * Device adapters. Every power source implements the same small interface:
 *
 *   on("data", ({ power, cadence, heartRate }) => ...)
 *   setGrade(gradePercent, {cw}?): Promise<void> simulation mode
 *   setTargetPower(watts): Promise<void>       ERG mode
 *   disconnect(): void
 *   label: string
 *
 * The app only depends on that interface, so the server's bike trainer and the
 * simulated trainer are interchangeable (and tests can use fakes).
 */

import { Emitter } from "../util/emitter.js";
import { PaddleModel } from "../ride/paddleModel.js";
import { t } from "../i18n/i18n.js";

/**
 * The trainer can follow the road, now or once it has control: true also while
 * another app blocks it. A ride plans its gears and ERG on this, not on control
 * at the moment of joining, which a busy trainer may give a few seconds late.
 */
export function couldControlResistance(trainer) {
  return Boolean(trainer) && (trainer.canControlResistance !== false || Boolean(trainer.controlBlocked));
}

/**
 * Trainer stand-in for testing without hardware. Power is set by the UI;
 * grade changes are only recorded.
 */
export class SimulatedTrainer extends Emitter {
  label = t("devices.simulatedLabel");
  canControlResistance = true;
  power = 150;
  grade = 0;
  targetPower = null;
  #timer = null;

  /** @param {{setInterval?: Function, clearInterval?: Function, periodMs?: number}} [deps] */
  constructor({ setInterval: schedule = (fn, ms) => globalThis.setInterval(fn, ms), clearInterval: cancel = (id) => globalThis.clearInterval(id), periodMs = 250 } = {}) {
    super();
    this.cancel = cancel;
    this.#timer = schedule(() => this.emit("data", this.reading()), periodMs);
  }

  reading() {
    return { power: this.power, cadence: this.power > 0 ? 85 : 0 };
  }

  setPower(watts) {
    this.power = Math.max(0, Math.min(2000, Math.round(watts)));
  }

  async setGrade(gradePercent) {
    this.grade = gradePercent;
    this.targetPower = null;
  }

  /** In ERG mode a trainer holds the target, so the simulated rider "produces" it. */
  async setTargetPower(watts) {
    this.targetPower = watts;
    this.setPower(watts);
  }

  disconnect() {
    this.cancel(this.#timer);
  }
}

/**
 * Phone paddles: power from tapping left and right in turn (see
 * ride/paddleModel.js). It can't change resistance, so ERG and virtual
 * shifting stay off; the road's grade only moves the sweet spot.
 */
export class PaddleTrainer extends Emitter {
  label = t("devices.paddlesLabel");
  canControlResistance = false;
  #timer = null;

  /** @param {{ftp?: number, now?: () => number, setInterval?: Function, clearInterval?: Function, periodMs?: number}} [deps] */
  constructor({
    ftp,
    now = () => globalThis.performance.now(),
    setInterval: schedule = (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: cancel = (id) => globalThis.clearInterval(id),
    periodMs = 250,
  } = {}) {
    super();
    this.model = new PaddleModel({ ftp });
    this.now = now;
    this.cancel = cancel;
    this.#timer = schedule(() => this.emit("data", this.reading()), periodMs);
  }

  /** The FTP can change on the start screen after picking the paddles. */
  setFtp(ftp) {
    this.model.ftp = Math.max(50, Number(ftp) || this.model.ftp);
  }

  /** @param {"left" | "right"} side @returns {"stroke" | "stumble" | "ignored"} */
  tap(side) {
    return this.model.tap(side, this.now());
  }

  /** Power and cadence for the ride, plus what the paddle view shows. */
  state() {
    return this.model.reading(this.now());
  }

  reading() {
    const { power, cadence } = this.state();
    return { power, cadence };
  }

  async setGrade(gradePercent) {
    this.model.setGrade(gradePercent);
  }

  disconnect() {
    this.cancel(this.#timer);
  }
}

/** What a ride's power comes from: a real trainer, the simulated trainer or phone paddles. */
export function deviceKind(trainer) {
  if (trainer instanceof PaddleTrainer) return "paddle";
  if (trainer instanceof SimulatedTrainer) return "sim";
  return "trainer";
}

/** Only rides measured by a real trainer go to Strava. */
export const hasRealPowerSource = (trainer) => Boolean(trainer) && deviceKind(trainer) === "trainer";

/** Phone paddle rides stay in the game: no ride files that could end up on Strava by hand. */
export const canExportRide = (trainer) => deviceKind(trainer) !== "paddle";
