export type CommitEnterBehavior = "blur" | "focus-next" | "none";

export type CommitInputKeyAction =
  | "none"
  | "escape-blur"
  | "enter-commit"
  | "enter-commit-blur"
  | "enter-commit-focus-next";

export type NumberSanitizeOptions = {
  integer?: boolean;
  minimum?: number;
  maximum?: number;
};

export type NumberParseResult =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "number"; value: number };

const EDITABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  "textarea:not([disabled]):not([readonly])",
  "select:not([disabled])",
  '[contenteditable="true"]',
].join(", ");

function isVisible(element: Element): boolean {
  return Boolean(
    (element as HTMLElement).offsetWidth ||
      (element as HTMLElement).offsetHeight ||
      element.getClientRects().length,
  );
}

export function isPlainEnterNavigationEvent(event: Pick<KeyboardEvent, "key" | "isComposing" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">): boolean {
  return (
    event.key === "Enter" &&
    !event.isComposing &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function getCommitInputKeyAction(
  event: Pick<KeyboardEvent, "key" | "isComposing" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  enterBehavior: CommitEnterBehavior = "blur",
): CommitInputKeyAction {
  if (event.key === "Escape") {
    return "escape-blur";
  }

  if (!isPlainEnterNavigationEvent(event)) {
    return "none";
  }

  if (enterBehavior === "focus-next") {
    return "enter-commit-focus-next";
  }

  if (enterBehavior === "blur") {
    return "enter-commit-blur";
  }

  return "enter-commit";
}

export function getEditableRoot(
  currentElement: Element,
  rootSelector?: string,
): ParentNode | null {
  if (rootSelector) {
    return currentElement.closest(rootSelector);
  }

  return currentElement.ownerDocument;
}

export function focusNextEditable(
  currentElement: HTMLElement,
  rootSelector?: string,
): boolean {
  const root = getEditableRoot(currentElement, rootSelector);
  if (!root) {
    return false;
  }

  const editableElements = Array.from(root.querySelectorAll(EDITABLE_SELECTOR)).filter(isVisible);
  const currentIndex = editableElements.indexOf(currentElement);
  if (currentIndex < 0) {
    return false;
  }

  const nextElement = editableElements[currentIndex + 1];
  if (!(nextElement instanceof HTMLElement)) {
    return false;
  }

  nextElement.focus();
  return true;
}

export function handleCommitInputKeydown(
  event: KeyboardEvent & { currentTarget: HTMLInputElement | HTMLTextAreaElement },
  {
    confirmValue,
    enterBehavior = "blur",
    focusRootSelector,
  }: {
    confirmValue?: () => boolean | void;
    enterBehavior?: CommitEnterBehavior;
    focusRootSelector?: string;
  } = {},
): void {
  const action = getCommitInputKeyAction(event, enterBehavior);
  if (action === "none") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (action === "escape-blur") {
    event.currentTarget.blur();
    return;
  }

  const didCommit = confirmValue?.();
  if (didCommit === false) {
    event.currentTarget.blur();
    return;
  }

  if (action === "enter-commit-focus-next") {
    if (!focusNextEditable(event.currentTarget, focusRootSelector)) {
      event.currentTarget.blur();
    }
    return;
  }

  if (action === "enter-commit-blur") {
    event.currentTarget.blur();
  }
}

export function sanitizeNumberText(
  value: string,
  {
    integer = false,
    minimum,
    maximum,
  }: NumberSanitizeOptions = {},
): string {
  let sanitized = value.trim();
  if (sanitized === "") {
    return "";
  }

  sanitized = integer
    ? sanitized.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "")
    : sanitized
        .replace(/[^\d.-]/g, "")
        .replace(/(?!^)-/g, "")
        .replace(/(\..*)\./g, "$1");

  if (
    sanitized === "" ||
    sanitized === "-" ||
    (!integer && (sanitized === "." || sanitized === "-."))
  ) {
    return sanitized;
  }

  const numericValue = Number(sanitized);
  if (!Number.isFinite(numericValue)) {
    return sanitized;
  }

  if (maximum !== undefined && numericValue > maximum) {
    return String(maximum);
  }

  if (minimum !== undefined && numericValue < minimum) {
    return String(minimum);
  }

  return sanitized;
}

export function parseNumberText(
  value: string,
  options: NumberSanitizeOptions = {},
): NumberParseResult {
  const sanitized = sanitizeNumberText(value, options);
  if (sanitized === "") {
    return { kind: "empty" };
  }

  const numericValue = Number(sanitized);
  if (!Number.isFinite(numericValue)) {
    return { kind: "invalid" };
  }

  return {
    kind: "number",
    value: options.integer ? Math.trunc(numericValue) : numericValue,
  };
}

export function formatNumberInputValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}
