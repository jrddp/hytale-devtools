import type { FieldInstance } from "../parsing/fieldInstances";

export function getFieldPanelId(field: FieldInstance): string {
  return getFieldPanelIdForPointer(getFieldJsonPointer(field));
}

export function getFieldInputId(field: FieldInstance): string {
  return `${getFieldPanelId(field)}-input`;
}

export function getFieldJsonPointer(field: Pick<FieldInstance, "fieldPath">): string {
  return normalizeFieldPointer(field.fieldPath);
}

// Asset editor pointers use slash-delimited paths like `Tags/Test/0`.
// They should not include a leading slash; `/Tags/Test/0` is tolerated for convenience.
// Literal `~` and `/` characters inside a path segment use the same escaping as the
// field-path builder: `~` -> `~0` and `/` -> `~1`.
export function getFieldPanelIdForPointer(pointer: string): string {
  const normalizedPointer = normalizeFieldPointer(pointer);
  return `asset-${normalizedPointer || "root"}`;
}

export function getFieldValueByPointer(
  pointer: string,
  root: Document | ParentNode = document,
): string | null {
  const panelId = getFieldPanelIdForPointer(pointer);
  const panelElement =
    "getElementById" in root
      ? root.getElementById(panelId)
      : root.querySelector<HTMLElement>(`#${CSS.escape(panelId)}`);

  return panelElement?.getAttribute("data-value") ?? null;
}

function normalizeFieldPointer(pointer: string): string {
  return pointer.startsWith("/") ? pointer.slice(1) : pointer;
}
