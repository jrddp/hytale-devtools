const EDITABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  "textarea:not([disabled]):not([readonly])",
  "select:not([disabled])",
  '[contenteditable="true"]',
].join(", ");

function isVisible(element) {
  return Boolean(element?.offsetWidth || element?.offsetHeight || element?.getClientRects?.().length);
}

export function getNodeEditorRoot(element) {
  return element?.closest?.("[data-node-editor-root]") ?? null;
}

export function focusNextEditableInNode(currentElement) {
  const root = getNodeEditorRoot(currentElement);
  if (!root) {
    return false;
  }

  const editableElements = Array.from(root.querySelectorAll(EDITABLE_SELECTOR)).filter(isVisible);
  const currentIndex = editableElements.indexOf(currentElement);
  if (currentIndex < 0) {
    return false;
  }

  const nextElement = editableElements[currentIndex + 1];
  if (!nextElement) {
    return false;
  }

  nextElement.focus();
  return true;
}

export function isPlainEnterNavigationEvent(event) {
  return (
    event?.key === "Enter" &&
    !event?.isComposing &&
    !event?.altKey &&
    !event?.ctrlKey &&
    !event?.metaKey &&
    !event?.shiftKey
  );
}
