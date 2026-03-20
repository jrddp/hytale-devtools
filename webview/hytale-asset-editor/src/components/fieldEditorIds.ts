import type { FieldInstance } from "../parsing/fieldInstances";

export function getFieldPanelId(field: FieldInstance): string {
  return getFieldPanelIdForPointer(field.fieldPath);
}

export function getFieldInputId(field: FieldInstance): string {
  return `${getFieldPanelId(field)}-input`;
}

/** @param pointer - pointer to field with no prepending slash */
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
