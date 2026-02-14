import { FIELD_TYPE_VALUES } from './types.js';

export function isSupportedFieldType(fieldType) {
  return FIELD_TYPE_VALUES.includes(fieldType);
}

export function validateTemplateFields(fields) {
  const diagnostics = [];
  const inputFields = Array.isArray(fields) ? fields : [];

  for (const field of inputFields) {
    if (typeof field?.id !== 'string' || !field.id.trim()) {
      diagnostics.push('Field is missing a valid `id`.');
      continue;
    }

    if (!isSupportedFieldType(field.type)) {
      diagnostics.push(`Field \`${field.id}\` has unsupported type \`${field.type}\`.`);
    }
  }

  return diagnostics;
}
