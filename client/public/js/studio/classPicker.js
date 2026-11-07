/**
 * The studio's class picker: the catalog's classes in a select, and a start
 * button that starts the picked class in my room right now (no timetable).
 * Pure wiring: the caller owns the elements and the `onStart` action.
 */

/** The classes a picker lists, in catalog order. */
export function classOptions(classes) {
  return classes.map((c) => ({ id: c.id, name: c.name }));
}

/**
 * Fills `select` with the classes and wires `button` to start the picked one.
 * An empty catalog disables both.
 * @param {{select: HTMLSelectElement, button: HTMLButtonElement, options: {id: string, name: string}[], onStart: (classId: string) => void}} picker
 */
export function wireClassPicker({ select, button, options, onStart }) {
  const classes = classOptions(options);
  for (const { id, name } of classes) {
    select.append(Object.assign(document.createElement("option"), { value: id, textContent: name }));
  }
  button.disabled = classes.length === 0;
  button.addEventListener("click", () => {
    if (select.value) onStart(select.value);
  });
}
