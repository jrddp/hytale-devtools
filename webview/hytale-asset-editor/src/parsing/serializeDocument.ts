import type {
  ArrayFieldInstance,
  FieldInstance,
  InlineOrReferenceFieldInstance,
  MapFieldInstance,
  ObjectFieldInstance,
  RefFieldInstance,
  RootFieldInstance,
  VariantFieldInstance,
} from "./fieldInstances";

export function serializeDocument(rootField: RootFieldInstance): Record<string, unknown> {
  const serialized = serializeField(rootField);
  if (!isPlainObject(serialized)) {
    throw new Error("Asset editor root field did not serialize to a JSON object.");
  }
  return serialized;
}

export function serializeDocumentText(rootField: RootFieldInstance): string {
  return JSON.stringify(serializeDocument(rootField), null, "\t");
}

function serializeField(field: FieldInstance | null | undefined): unknown {
  if (!field) {
    return undefined;
  }

  switch (field.type) {
    case "string":
    case "number":
    case "boolean":
    case "color":
      return serializeScalarField(field);
    case "object":
      return serializeObjectField(field as ObjectFieldInstance);
    case "array":
      return serializeArrayField(field as ArrayFieldInstance);
    case "map":
      return serializeMapField(field as MapFieldInstance);
    case "variant":
      return serializeVariantField(field as VariantFieldInstance);
    case "ref":
      return serializeRefField(field as RefFieldInstance);
    case "inlineOrReference":
      return serializeInlineOrReferenceField(field as InlineOrReferenceFieldInstance);
    case "rawJson":
    case "timeline":
    case "weightedTimeline":
      return field.unparsedData;
    default:
      return exhaustiveField(field);
  }
}

function serializeScalarField(field: FieldInstance): unknown {
  if (field.value !== undefined) {
    return field.value;
  }
  return field.unparsedData;
}

function serializeObjectField(field: ObjectFieldInstance): unknown {
  if (field.unparsedData !== undefined && !isPlainObject(field.unparsedData)) {
    return field.unparsedData;
  }

  const serialized: Record<string, unknown> = isPlainObject(field.unparsedData)
    ? { ...field.unparsedData }
    : {};

  for (const childField of Object.values(field.properties)) {
    if (!childField.schemaKey) {
      continue;
    }

    const childValue = serializeField(childField);
    if (childValue !== undefined) {
      serialized[childField.schemaKey] = childValue;
    }
  }

  return field.isPresent || Object.keys(serialized).length > 0 ? serialized : undefined;
}

function serializeArrayField(field: ArrayFieldInstance): unknown {
  if (field.unparsedData !== undefined && !Array.isArray(field.unparsedData)) {
    return field.unparsedData;
  }

  const serialized = Array.isArray(field.items)
    ? serializeTupleArrayField(field)
    : field.parsedItems
        .map(item => serializeField(item as FieldInstance))
        .filter(item => item !== undefined);

  if (Array.isArray(field.unparsedData)) {
    serialized.push(...field.unparsedData);
  }

  return field.isPresent || serialized.length > 0 ? serialized : undefined;
}

function serializeTupleArrayField(field: ArrayFieldInstance): unknown[] {
  const tupleRow = Array.isArray(field.parsedItems[0]) ? field.parsedItems[0] : [];
  const serialized = tupleRow.map(item => serializeField(item));

  while (serialized.length > 0 && serialized.at(-1) === undefined) {
    serialized.pop();
  }

  return serialized;
}

function serializeMapField(field: MapFieldInstance): unknown {
  if (field.unparsedData !== undefined && !isPlainObject(field.unparsedData)) {
    return field.unparsedData;
  }

  const serialized: Record<string, unknown> = isPlainObject(field.unparsedData)
    ? { ...field.unparsedData }
    : {};

  for (const entry of field.entries) {
    const entryValue = serializeField(entry.valueField);
    if (entryValue !== undefined) {
      serialized[entry.key] = entryValue;
    }
  }

  return field.isPresent || Object.keys(serialized).length > 0 ? serialized : undefined;
}

function serializeVariantField(field: VariantFieldInstance): unknown {
  if (field.unparsedData !== undefined && !field.activeVariantField) {
    return field.unparsedData;
  }

  const serialized = serializeField(field.activeVariantField);
  const serializedObject = isPlainObject(serialized) ? { ...serialized } : {};
  const identityValue = field.selectedIdentity ?? serializeField(field.identityField);

  if (identityValue !== undefined) {
    serializedObject[field.identityField.schemaKey] = identityValue;
  }

  return field.isPresent || Object.keys(serializedObject).length > 0 ? serializedObject : undefined;
}

function serializeRefField(field: RefFieldInstance): unknown {
  return serializeField(field.resolvedField);
}

function serializeInlineOrReferenceField(field: InlineOrReferenceFieldInstance): unknown {
  switch (field.mode) {
    case "string":
      return field.stringValue ?? serializeField(field.stringField);
    case "inline":
      return serializeField(field.inlineValueField);
    case "empty":
      return field.unparsedData;
    default:
      return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exhaustiveField(field: never): never {
  throw new Error(`Unsupported field type: ${JSON.stringify(field)}`);
}
