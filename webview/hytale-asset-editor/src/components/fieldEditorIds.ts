import type { FieldInstance } from "../parsing/fieldInstances";

const fieldEditorIds = new WeakMap<FieldInstance, string>();
let nextFieldEditorId = 0;

export function getFieldEditorId(field: FieldInstance): string {
  let fieldEditorId = fieldEditorIds.get(field);
  if (!fieldEditorId) {
    nextFieldEditorId += 1;
    fieldEditorId = `asset-field-${nextFieldEditorId}`;
    fieldEditorIds.set(field, fieldEditorId);
  }

  return fieldEditorId;
}
