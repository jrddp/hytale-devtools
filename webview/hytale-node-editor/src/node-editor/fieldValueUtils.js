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

function normalizeNonEmptyString(candidate) {
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

export function normalizeFieldType(candidateType) {
  return normalizeNonEmptyString(candidateType) ?? '';
}

export function normalizeFieldOptions(options) {
  return isObject(options) ? options : {};
}

function readFieldId(field) {
  return normalizeNonEmptyString(field?.id) ?? normalizeNonEmptyString(field?.Id);
}

function readFieldType(field) {
  return normalizeFieldType(field?.type) || normalizeFieldType(field?.Type);
}

function readFieldOptions(field) {
  if (isObject(field?.options)) {
    return { ...field.options };
  }

  if (isObject(field?.Options)) {
    return { ...field.Options };
  }

  return {};
}

function normalizeFieldDefinition(field) {
  if (!isObject(field)) {
    return undefined;
  }

  const id = readFieldId(field);
  const type = readFieldType(field);
  if (!id || !type) {
    return undefined;
  }

  const options = normalizeNestedFieldOptions(readFieldOptions(field));

  return {
    id,
    type,
    label:
      normalizeNonEmptyString(options.Label) ??
      normalizeNonEmptyString(field?.label) ??
      normalizeNonEmptyString(field?.Label) ??
      id,
    options,
  };
}

function normalizeNestedFieldOptions(options) {
  const normalized = normalizeFieldOptions(options);
  const withNormalizedFields = { ...normalized };
  const nestedFieldsCandidate = Array.isArray(normalized.Fields)
    ? normalized.Fields
    : Array.isArray(normalized.fields)
      ? normalized.fields
      : undefined;

  if (Array.isArray(nestedFieldsCandidate)) {
    withNormalizedFields.Fields = nestedFieldsCandidate
      .map((candidate) => normalizeFieldDefinition(candidate))
      .filter((candidate) => Boolean(candidate));
  }

  delete withNormalizedFields.fields;

  const elementOptionsCandidate = isObject(normalized.ElementOptions)
    ? normalized.ElementOptions
    : isObject(normalized.elementOptions)
      ? normalized.elementOptions
      : undefined;

  if (elementOptionsCandidate) {
    withNormalizedFields.ElementOptions = normalizeNestedFieldOptions(elementOptionsCandidate);
  }

  delete withNormalizedFields.elementOptions;

  return withNormalizedFields;
}

export function getObjectNestedFields(field) {
  const options = normalizeNestedFieldOptions(readFieldOptions(field));
  const nestedFieldsCandidate = Array.isArray(options.Fields)
    ? options.Fields
    : Array.isArray(options.fields)
      ? options.fields
      : [];

  return nestedFieldsCandidate
    .map((candidate) => normalizeFieldDefinition(candidate))
    .filter((candidate) => Boolean(candidate));
}

export function getFieldLabel(field) {
  const options = normalizeNestedFieldOptions(readFieldOptions(field));
  if (typeof options.Label === 'string' && options.Label.trim()) {
    return options.Label.trim();
  }

  if (typeof field?.label === 'string' && field.label.trim()) {
    return field.label.trim();
  }

  const normalizedFieldId = readFieldId(field);
  if (normalizedFieldId) {
    return normalizedFieldId;
  }

  return 'Field';
}

export function getListElementType(field) {
  const options = normalizeNestedFieldOptions(readFieldOptions(field));

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

function readEnumStrictOption(options) {
  if (typeof options?.Strict === 'boolean') {
    return options.Strict;
  }

  if (typeof options?.strict === 'boolean') {
    return options.strict;
  }

  return true;
}

export function createDefaultFieldValue(field) {
  const type = readFieldType(field);
  const options = normalizeNestedFieldOptions(readFieldOptions(field));

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
    const isStrictEnum = readEnumStrictOption(options);
    if (typeof options.Default === 'string' && (!isStrictEnum || values.includes(options.Default))) {
      return options.Default;
    }

    if (!isStrictEnum) {
      return '';
    }

    return values[0] ?? '';
  }

  if (type === FIELD_TYPES.LIST) {
    return [];
  }

  if (type === FIELD_TYPES.OBJECT) {
    const nestedFields = getObjectNestedFields({ options });
    const nestedValue = {};

    for (const nestedField of nestedFields) {
      nestedValue[nestedField.id] = createDefaultFieldValue(nestedField);
    }

    return nestedValue;
  }

  return '';
}

export function normalizeFieldValue(field, value) {
  const type = readFieldType(field);
  const options = normalizeNestedFieldOptions(readFieldOptions(field));

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
    const isStrictEnum = readEnumStrictOption(options);

    if (!isStrictEnum) {
      return typeof value === 'string' ? value : String(value ?? '');
    }

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
    const nestedFields = getObjectNestedFields({ options });
    const source = isObject(value) ? value : {};
    const normalizedObject = { ...source };

    for (const nestedField of nestedFields) {
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
    const fieldId = readFieldId(field);
    if (!fieldId) {
      continue;
    }

    result[fieldId] = createDefaultFieldValue(field);
  }

  return result;
}
