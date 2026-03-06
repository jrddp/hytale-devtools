export type FieldProps<T> = {
  inputId: string;
  label: string;
  description?: string;
  initialValue: T;
  inputWidth?: number;
  onconfirm: (value: T) => void;
};

export function buildFieldInputId(
  nodeId: string,
  schemaKey: string,
  parentSchemaKey?: string,
): string {
  return ["field", nodeId, parentSchemaKey, schemaKey].filter(Boolean).join("-");
}

/** Expand this object on field elements to prevent pointer events from propagating to Svelte Flow and selecting the node */
export const noMousePropogation = {
  onpointerdown: (e: PointerEvent) => e.stopPropagation(),
  onmousedown: (e: MouseEvent) => e.stopPropagation(),
  onclick: (e: MouseEvent) => e.stopPropagation(),
};

// sorts *variants to the bottom
export function sortVariantsToBottom(sourceValues: string[]): string[] {
  const values = Array.isArray(sourceValues) ? [...sourceValues] : [];
  values.sort((left, right) => {
    const leftStartsWithStar = left.startsWith('*');
    const rightStartsWithStar = right.startsWith('*');
    if (leftStartsWithStar !== rightStartsWithStar) {
      return leftStartsWithStar ? 1 : -1;
    }

    return left.localeCompare(right);
  });
  return values;
}
