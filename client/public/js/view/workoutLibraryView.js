/**
 * The start menu's workout library: a radio group of structured workouts with a
 * zone-coloured strip. Pure helpers decide what to show; `renderWorkoutLibrary`
 * writes it with textContent only, because names can come from an imported file.
 */

import { t } from "../i18n/i18n.js";
import { totalDuration, workoutDescription, workoutName, segmentLabel, zoneFor } from "../ride/workout.js";
import { ZONE_COLORS } from "./workoutView.js";

/** The segments of a workout as fractions of its length, each with its zone colour. */
export function workoutStrip(workout) {
  const total = totalDuration(workout);
  return workout.segments.map((segment) => {
    const zone = zoneFor((segment.from + segment.to) / 2);
    return { fraction: segment.durationS / total, zone, color: ZONE_COLORS[zone - 1], label: segment.label, seconds: segment.durationS };
  });
}

/** What a library card shows. */
export function libraryCard(workout) {
  return {
    name: workoutName(workout),
    minutes: Math.round(totalDuration(workout) / 60),
    description: workoutDescription(workout),
    strip: workoutStrip(workout),
  };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Draws the cards into `container`. The selected name falls back to the first
 * workout when it is unknown (an old saved pick, or a renamed import).
 * @param {HTMLElement} container
 * @param {object[]} workouts
 * @param {{selectedName: string | null, onSelect: (name: string) => void}} options
 */
export function renderWorkoutLibrary(container, workouts, { selectedName, onSelect }) {
  const names = workouts.map((workout) => workoutName(workout));
  const current = names.includes(selectedName) ? selectedName : names[0] ?? null;
  const hadFocus = container.contains(container.ownerDocument?.activeElement ?? null);
  let focusTarget = null;
  const cards = workouts.map((workout, index) => {
    const card = libraryCard(workout);
    const selected = card.name === current;
    const radio = element("div", selected ? "workout-card selected" : "workout-card");
    radio.setAttribute("role", "radio");
    radio.setAttribute("aria-checked", String(selected));
    radio.tabIndex = selected ? 0 : -1;
    if (selected) focusTarget = radio;
    const head = element("span", "route-head");
    head.append(element("strong", "route-name", card.name), element("span", "route-tag", t("workout.tag.erg")));
    const strip = element("div", "block-strip");
    card.strip.forEach((segment, i) => {
      const text = t("workout.summary.seconds", { label: segmentLabel(segment.label), s: segment.seconds });
      const part = element("div", "strip-segment");
      part.dataset.segment = String(i);
      part.style.flexGrow = String(segment.fraction);
      part.style.background = segment.color;
      part.title = text;
      part.setAttribute("aria-label", text);
      strip.append(part);
    });
    radio.append(head, element("span", "route-stats", t("workout.minutes", { n: card.minutes })), element("span", "route-description", card.description), strip);
    radio.addEventListener("click", () => onSelect(card.name));
    radio.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      onSelect(names[(index + step + names.length) % names.length]);
    });
    return radio;
  });
  container.replaceChildren(...cards);
  if (hadFocus) focusTarget?.focus();
}
