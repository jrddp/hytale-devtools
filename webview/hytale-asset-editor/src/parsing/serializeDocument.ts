import { isObject } from "../../../../src/shared/typeUtils";
import type {
  ArrayFieldInstance,
  FieldInstance,
  InlineOrReferenceFieldInstance,
  MapFieldInstance,
  ObjectFieldInstance,
  RootFieldInstance,
  VariantFieldInstance,
} from "./fieldInstances";

export function serializeDocument(rootField: RootFieldInstance): Record<string, unknown> {
  const serialized = serializeField(rootField);
  if (serialized === undefined) {
    return {};
  }
  if (!isObject(serialized)) {
    throw new Error("Asset editor root field did not serialize to a JSON object.");
  }
  return serialized;
}

export function serializeDocumentText(rootField: RootFieldInstance): string {
  return JSON.stringify(serializeDocument(rootField), null, "\t");
}

/** @param fallbackToEmptyObject - causes unset composite fields to serialize as {} / [] and array-like scalar holes as null. */
function serializeField(
  field: FieldInstance | null | undefined,
  fallbackToEmptyObject = false,
): unknown {
  if (!field) {
    return undefined;
  }
  if (field.isNull) {
    return null;
  }

  switch (field.type) {
    case "string":
    case "number":
    case "boolean":
    case "color":
      return field.value ?? (fallbackToEmptyObject ? null : undefined);
    case "object":
      return serializeObjectField(field as ObjectFieldInstance, fallbackToEmptyObject);
    case "array":
      return serializeArrayField(field as ArrayFieldInstance, fallbackToEmptyObject);
    case "map":
      return serializeMapField(field as MapFieldInstance, fallbackToEmptyObject);
    case "variant":
      return serializeVariantField(field as VariantFieldInstance, fallbackToEmptyObject);
    case "inlineOrReference":
      return serializeInlineOrReferenceField(
        field as InlineOrReferenceFieldInstance,
        fallbackToEmptyObject,
      );
    case "rawJson":
      if (field.value === undefined) {
        return undefined;
      }
      return JSON.parse(field.value);
    case "timeline":
    case "weightedTimeline":
      return field.unparsedData;
    default:
      return exhaustiveField(field);
  }
}

function serializeObjectField(field: ObjectFieldInstance, fallbackToEmptyObject = false): unknown {
  const serialized: Record<string, unknown> = { ...field.unparsedData };

  for (const [key, childField] of Object.entries(field.properties)) {
    const childValue = serializeField(childField);
    if (childValue !== undefined) {
      serialized[key] = childValue;
    }
  }

  if (Object.keys(serialized).length > 0) {
    return serialized;
  }
  if ("rawFallback" in field) {
    return field.rawFallback;
  }
  return fallbackToEmptyObject ? {} : undefined;
}

function serializeArrayField(field: ArrayFieldInstance, fallbackToEmptyObject = false): unknown {
  const serialized = field.items.map(item => serializeField(item, true));
  if (field.isTuple && serialized.every(item => item === null)) {
    return fallbackToEmptyObject ? [] : undefined;
  }
  if (serialized.length > 0) {
    return serialized;
  }
  if ("rawFallback" in field) {
    return field.rawFallback;
  }
  return fallbackToEmptyObject ? [] : undefined;
}

function serializeMapField(field: MapFieldInstance, fallbackToEmptyObject = false): unknown {
  const serialized: Record<string, unknown> = {};

  for (const { key, valueField } of field.entries) {
    const value = serializeField(valueField, true);
    serialized[key] = value;
  }

  if (Object.keys(serialized).length > 0) {
    return serialized;
  }
  if ("rawFallback" in field) {
    return field.rawFallback;
  }
  return fallbackToEmptyObject ? {} : undefined;
}

function serializeVariantField(
  field: VariantFieldInstance,
  fallbackToEmptyObject = false,
): unknown {
  const serialized = serializeField(field.activeVariant, fallbackToEmptyObject);
  if (serialized !== undefined) {
    return serialized;
  }
  if ("rawFallback" in field) {
    return field.rawFallback;
  }
  return undefined;
}

function serializeInlineOrReferenceField(
  field: InlineOrReferenceFieldInstance,
  fallbackToEmptyObject = false,
): unknown {
  return serializeField(field.activeField, fallbackToEmptyObject);
}

function exhaustiveField(field: never): never {
  throw new Error(`Unsupported field type: ${JSON.stringify(field)}`);
}
