/**
 * The bike the server itself is connected to over Bluetooth (ADR 0020): the
 * server talks GATT to the Yesoul S3 and relays readings in `bike` messages.
 *
 * A `ServerBikeTrainer` is fed those messages (main.js wires them from the
 * game connection) and implements the trainer interface the app already
 * knows, so from here on everything — telemetry, ride recording, the
 * live check — works exactly like a Web Bluetooth trainer.
 *
 * The S3's brake knob is mechanical: there is no remote resistance control,
 * so the control calls answer without an effect and the app treats this
 * trainer as power-only.
 */

import { Emitter } from "../util/emitter.js";

export class ServerBikeTrainer extends Emitter {
  canControlResistance = false;
  connected = false;

  /** @param {{label?: string}} deps */
  constructor({ label } = {}) {
    super();
    this.label = label;
  }

  /**
   * Feeds one `bike` message from the game connection to the app.
   * @param {{type?: string, connected?: boolean, power?: number, cadence?: number, resistance?: number, distance_m?: number} | null} message
   */
  onBike(message) {
    if (!message || message.type !== "bike") return;
    const wasConnected = this.connected;
    this.connected = Boolean(message.connected);
    if (this.connected) {
      if (!wasConnected) this.emit("reconnected");
      this.emit("data", {
        power: message.power ?? 0,
        cadence: message.cadence ?? 0,
        resistance: message.resistance ?? 0,
        distance_m: message.distance_m ?? 0,
      });
    } else if (wasConnected) {
      this.emit("disconnected");
    }
  }

  /** The S3 cannot follow the road; the call answers so the ride goes on. */
  async setGrade() {}

  /** No ERG on an S3 either. */
  async setTargetPower() {}

  /**
   * Only ends this adapter's interest in the bike's readings: the claim dies
   * with the game connection anyway, and with it the server hangs the link
   * up, so the bike is free for other apps.
   */
  disconnect() {
    this.connected = false;
  }
}
