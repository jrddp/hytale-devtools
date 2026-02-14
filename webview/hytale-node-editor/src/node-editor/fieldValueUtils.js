import { FIELD_TYPES } from './types.js';

const TEXT_FIELD_TYPES = new Set([
  FIELD_TYPES.SMALL_STRING,
  FIELD_TYPES.STRING,
  FIELD_TYPES.FILE_PATH,
]);

const NUMBER_FIELD_TYPES = new Set([
  FIELD_TYPES.FLOAT,
  FIELD_TYPES.INT,
  FIELD_TYPES.INTEGER,
  FIELD_TYPES.INT_SLIDER,
]);

const BOOLEAN_FIELD_TYPES = new Set([
  FIELD_TYPES.CHECKBOX,
  FIELD_TYPES.BOOL,
]);

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeFieldType(candidateType) {
  return typeof candidateType === 'string' ? candidateType.trim() : '';
}

export function normalizeFieldOptions(options) {
  return isObject(options) ? options : {};
}

export function getFieldLabel(field) {
  const options = normalizeFieldOptions(field?.options);
  if (typeof options.Label === 'string' && options.Label.trim()) {
    return options.Label.trim();
  }

  if (typeof field?.label === 'string' && field.label.trim()) {
    return field.label.trim();
  }

  if (typeof field?.id === 'string' && field.id.trim()) {
    return field.id.trim();
  }

  return 'Field';
}

export function getListElementType(field) {
  const options = normalizeFieldOptions(field?.options);

  if (typeof options.Type === 'string' && options.Type.trim()) {
    return options.Type.trim();
  }

  if (typeof options.ArrayElementType === 'string' && options.ArrayElementType.trim()) {
    return options.ArrayElementType.trim();
  }

  return FIELD_TYPES.STRING;
}

function coerceNumber(value, fallback, integerOnly = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return integerOnly ? Math.round(parsed) : parsed;
}

function clampNumber(value, min, max) {
  let clamped = value;
  if (Number.isFinite(min)) {
    clamped = Math.max(clamped, min);
  }
  if (Number.isFinite(max)) {
    clamped = Math.min(clamped, max);
  }
  return clamped;
}

function readOptionNumber(options, key, fallback) {
  const parsed = Number(options?.[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanOption(options, ...keys) {
  for (const key of keys) {
    if (typeof options?.[key] === 'boolean') {
      return options[key];
    }
  }

  return false;
}

function readEnumValues(options) {
  return Array.isArray(options?.Values)
    ? options.Values.filter((value) => typeof value === 'string')
    : [];
}

export function createDefaultFieldValue(field) {
  const type = normalizeFieldType(field?.type);
  const options = normalizeFieldOptions(field?.options);

  if (TEXT_FIELD_TYPES.has(type)) {
    return typeof options.Default === 'string' ? options.Default : '';
  }

  if (type === FIELD_TYPES.FLOAT) {
    return readOptionNumber(options, 'Default', 0);
  }

  if (type === FIELD_TYPES.INT || type === FIELD_TYPES.INTEGER || type === FIELD_TYPES.INT_SLIDER) {
    return Math.round(readOptionNumber(options, 'Default', 0));
  }

  if (BOOLEAN_FIELD_TYPES.has(type)) {
    return readBooleanOption(options, 'Default', 'DefaultValue');
  }

  if (type === FIELD_TYPES.ENUM) {
    const values = readEnumValues(options);
    if (typeof options.Default === 'string' && values.includes(options.Default)) {
      return options.Default;
    }

    return values[0] ?? '';
  }

  if (type === FIELD_TYPES.LIST) {
    return [];
  }

  if (type === FIELD_TYPES.OBJECT) {
    const nestedFields = Array.isArray(options.Fields) ? options.Fields : [];
    const nestedValue = {};

    for (const nestedField of nestedFields) {
      if (typeof nestedField?.id !== 'string' || !nestedField.id.trim()) {
        continue;
      }
      nestedValue[nestedField.id] = createDefaultFieldValue(nestedField);
    }

    return nestedValue;
  }

  return '';
}

export function normalizeFieldValue(field, value) {
  const type = normalizeFieldType(field?.type);
  const options = normalizeFieldOptions(field?.options);

  if (TEXT_FIELD_TYPES.has(type)) {
    return typeof value === 'string' ? value : String(value ?? '');
  }

  if (type === FIELD_TYPES.FLOAT) {
    return coerceNumber(value, createDefaultFieldValue(field), false);
  }

  if (type === FIELD_TYPES.INT || type === FIELD_TYPES.INTEGER) {
    return coerceNumber(value, createDefaultFieldValue(field), true);
  }

  if (type === FIELD_TYPES.INT_SLIDER) {
    const fallback = createDefaultFieldValue(field);
    const min = readOptionNumber(options, 'Min', Number.NaN);
    const max = readOptionNumber(options, 'Max', Number.NaN);
    const coerced = coerceNumber(value, fallback, true);
    return clampNumber(coerced, min, max);
  }

  if (BOOLEAN_FIELD_TYPES.has(type)) {
    return Boolean(value);
  }

  if (type === FIELD_TYPES.ENUM) {
    const values = readEnumValues(options);
    const fallback = createDefaultFieldValue(field);

    if (typeof value === 'string' && values.includes(value)) {
      return value;
    }

    return fallback;
  }

  if (type === FIELD_TYPES.LIST) {
    return Array.isArray(value) ? value : [];
  }

  if (type === FIELD_TYPES.OBJECT) {
    const nestedFields = Array.isArray(options.Fields) ? options.Fields : [];
    const source = isObject(value) ? value : {};
    const normalizedObject = {};

    for (const nestedField of nestedFields) {
      if (typeof nestedField?.id !== 'string' || !nestedField.id.trim()) {
        continue;
      }

      normalizedObject[nestedField.id] = normalizeFieldValue(nestedField, source[nestedField.id]);
    }

    return normalizedObject;
  }

  if (NUMBER_FIELD_TYPES.has(type)) {
    return coerceNumber(value, 0, false);
  }

  return value;
}

export function buildFieldValueMap(fields) {
  const result = {};
  const sourceFields = Array.isArray(fields) ? fields : [];

  for (const field of sourceFields) {
    if (typeof field?.id !== 'string' || !field.id.trim()) {
      continue;
    }

    result[field.id] = createDefaultFieldValue(field);
  }

  return result;
}
