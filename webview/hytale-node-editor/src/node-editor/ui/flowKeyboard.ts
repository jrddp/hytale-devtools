export function isDebugSchemaKeyShortcut(event: KeyboardEvent) {
  return (
    event.key.toLowerCase() === "d" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isDeleteOrBackspace(event: KeyboardEvent) {
  return event.key === "Delete" || event.key === "Backspace";
}

const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton']";

function isEditableTarget(target: EventTarget | null | undefined) {
  const element = target as Element | null | undefined;
  if (element?.matches?.(EDITABLE_SELECTOR)) {
    return true;
  }

  return Boolean(element?.closest?.(EDITABLE_SELECTOR));
}

export function isShortcutBlockedByEditableTarget(eventTarget?: EventTarget | null) {
  if (isEditableTarget(eventTarget)) {
    return true;
  }

  return isEditableTarget(globalThis.document?.activeElement);
}
