import type { Field, ObjectField, RefField, VariantField } from "@shared/fieldTypes";
import type {
  ArrayFieldInstance,
  BooleanFieldInstance,
  ColorFieldInstance,
  FieldInstance,
  InlineOrReferenceFieldInstance,
  MapFieldInstance,
  NumberFieldInstance,
  ObjectFieldInstance,
  RawJsonFieldInstance,
  RefFieldInstance,
  RootFieldInstance,
  StringFieldInstance,
  TimelineFieldInstance,
  VariantFieldInstance,
  WeightedTimelineFieldInstance,
} from "./fieldInstances";

type FieldLookup = Pick<ReadonlyMap<string, Field | null>, "get" | "has">;

type ParseContext = {
  resolvedRefsByRef: FieldLookup;
};

type ReachableRefState = {
  resolvedRefsByRef: FieldLookup;
  reachableRefs: Set<string>;
  invalidRefs: Set<string>;
};

export type ParseDocumentResult =
  | {
      status: "ready";
      rootField: RootFieldInstance;
    }
  | {
      status: "waiting-for-refs";
      missingRefs: string[];
    }
  | {
      status: "error";
      error: string;
    };

export function parseDocumentText({
  text,
  rootField,
  resolvedRefsByRef = new Map<string, Field | null>(),
}: {
  text: string;
  rootField: ObjectField | VariantField;
  resolvedRefsByRef?: FieldLookup;
}): ParseDocumentResult {
  let documentRoot: unknown;

  try {
    documentRoot = JSON.parse(stripBom(text));
  } catch (error) {
    return {
      status: "error",
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isPlainObject(documentRoot)) {
    return {
      status: "error",
      error: "Document must be a JSON object.",
    };
  }

  const reachableRefState: ReachableRefState = {
    resolvedRefsByRef,
    reachableRefs: new Set(),
    invalidRefs: new Set(),
  };

  collectReachableRefs(rootField, documentRoot, reachableRefState);

  if (reachableRefState.invalidRefs.size > 0) {
    return {
      status: "error",
      error: `Required schema reference could not be resolved: ${Array.from(reachableRefState.invalidRefs).sort()[0]}`,
    };
  }

  const missingRefs = Array.from(reachableRefState.reachableRefs).filter(
    refId => !resolvedRefsByRef.has(refId),
  );

  if (missingRefs.length > 0) {
    return {
      status: "waiting-for-refs",
      missingRefs: missingRefs.sort(),
    };
  }

  return {
    status: "ready",
    rootField: populateFieldInstance(cloneFieldInstance(rootField), documentRoot, {
      resolvedRefsByRef,
    }) as RootFieldInstance,
  };
}

export function createEmptyFieldInstance<TField extends Field>(
  field: TField,
  resolvedRefsByRef: FieldLookup = new Map<string, Field | null>(),
): TField & FieldInstance {
  return populateFieldInstance(cloneFieldInstance(field), undefined, {
    resolvedRefsByRef,
  }) as TField & FieldInstance;
}

function collectReachableRefs(field: Field, rawValue: unknown, state: ReachableRefState): void {
  switch (field.type) {
    case "object": {
      const rawObject = isPlainObject(rawValue) ? rawValue : null;

      for (const [schemaKey, childField] of Object.entries(field.properties)) {
        collectReachableRefs(childField, rawObject?.[schemaKey], state);
      }
      return;
    }

    case "array": {
      if (!Array.isArray(rawValue)) {
        return;
      }

      if (Array.isArray(field.items)) {
        for (const [index, itemField] of field.items.entries()) {
          collectReachableRefs(itemField, rawValue[index], state);
        }
        return;
      }

      for (const item of rawValue) {
        collectReachableRefs(field.items, item, state);
      }
      return;
    }

    case "map": {
      if (!isPlainObject(rawValue)) {
        return;
      }

      for (const value of Object.values(rawValue)) {
        collectReachableRefs(field.valueField, value, state);
      }
      return;
    }

    case "variant": {
      if (!isPlainObject(rawValue)) {
        return;
      }

      const selectedIdentity = rawValue[field.identityField.schemaKey];
      if (typeof selectedIdentity !== "string") {
        return;
      }

      const activeVariantField = field.variantsByIdentity[selectedIdentity];
      if (activeVariantField) {
        collectReachableRefs(activeVariantField, rawValue, state);
      }
      return;
    }

    case "ref": {
      state.reachableRefs.add(field.$ref);
      if (!state.resolvedRefsByRef.has(field.$ref)) {
        return;
      }

      const resolvedField = state.resolvedRefsByRef.get(field.$ref);
      if (!resolvedField) {
        state.invalidRefs.add(field.$ref);
        return;
      }

      collectReachableRefs(resolvedField, rawValue, state);
      return;
    }

    case "inlineOrReference": {
      if (typeof rawValue === "string") {
        return;
      }

      if (isPlainObject(rawValue)) {
        collectReachableRefs(field.inlineField, rawValue, state);
      }
      return;
    }

    default:
      return;
  }
}

function populateFieldInstance<TField extends FieldInstance>(
  field: TField,
  rawValue: unknown,
  context: ParseContext,
): TField {
  field.isPresent = rawValue !== undefined;

  switch (field.type) {
    case "string":
      return populateStringField(field, rawValue) as TField;
    case "number":
      return populateNumberField(field, rawValue) as TField;
    case "boolean":
      return populateBooleanField(field, rawValue) as TField;
    case "color":
      return populateColorField(field, rawValue) as TField;
    case "object":
      return populateObjectField(field as ObjectFieldInstance, rawValue, context) as TField;
    case "array":
      return populateArrayField(field as ArrayFieldInstance, rawValue, context) as TField;
    case "map":
      return populateMapField(field as MapFieldInstance, rawValue, context) as TField;
    case "variant":
      return populateVariantField(field as VariantFieldInstance, rawValue, context) as TField;
    case "ref":
      return populateRefField(field as RefFieldInstance, rawValue, context) as TField;
    case "inlineOrReference":
      return populateInlineOrReferenceField(
        field as InlineOrReferenceFieldInstance,
        rawValue,
        context,
      ) as TField;
    case "timeline":
      return populateRawPayloadField(field, rawValue) as TField;
    case "weightedTimeline":
      return populateRawPayloadField(field, rawValue) as TField;
    case "rawJson":
      return populateRawPayloadField(field, rawValue) as TField;
    default:
      return exhaustiveField(field);
  }
}

function populateStringField(field: StringFieldInstance, rawValue: unknown): StringFieldInstance {
  if (typeof rawValue === "string") {
    field.value = rawValue;
    return field;
  }

  return setUnparsedData(field, rawValue);
}

function populateNumberField(field: NumberFieldInstance, rawValue: unknown): NumberFieldInstance {
  if (typeof rawValue === "number" || (field.allowInfinity && typeof rawValue === "string")) {
    field.value = rawValue;
    return field;
  }

  return setUnparsedData(field, rawValue);
}

function populateBooleanField(
  field: BooleanFieldInstance,
  rawValue: unknown,
): BooleanFieldInstance {
  if (typeof rawValue === "boolean") {
    field.value = rawValue;
    return field;
  }

  return setUnparsedData(field, rawValue);
}

function populateColorField(field: ColorFieldInstance, rawValue: unknown): ColorFieldInstance {
  if (typeof rawValue === "string") {
    field.value = rawValue;
    return field;
  }

  return setUnparsedData(field, rawValue);
}

function populateObjectField(
  field: ObjectFieldInstance,
  rawValue: unknown,
  context: ParseContext,
): ObjectFieldInstance {
  const rawObject = isPlainObject(rawValue) ? rawValue : null;
  const schemaKeys = new Set(Object.keys(field.properties));

  for (const [schemaKey, childField] of Object.entries(field.properties)) {
    field.properties[schemaKey] = populateFieldInstance(
      childField as FieldInstance,
      rawObject?.[schemaKey],
      context,
    );
  }

  field.unparsedData = rawObject
    ? compactObject(Object.fromEntries(Object.entries(rawObject).filter(([schemaKey]) => !schemaKeys.has(schemaKey))))
    : rawValue !== undefined
      ? rawValue
      : undefined;
  return field;
}

function populateArrayField(
  field: ArrayFieldInstance,
  rawValue: unknown,
  context: ParseContext,
): ArrayFieldInstance {
  if (!Array.isArray(rawValue)) {
    field.parsedItems = [];
    return setUnparsedData(field, rawValue);
  }

  if (Array.isArray(field.items)) {
    field.parsedItems = [
      field.items.map((itemField, index) =>
        populateFieldInstance(cloneFieldInstance(itemField as Field), rawValue[index], context),
      ),
    ];
    field.unparsedData = rawValue.length > field.items.length ? rawValue.slice(field.items.length) : undefined;
    return field;
  }

  field.parsedItems = rawValue.map(item =>
    populateFieldInstance(cloneFieldInstance(field.items as Field), item, context),
  );
  return field;
}

function populateMapField(
  field: MapFieldInstance,
  rawValue: unknown,
  context: ParseContext,
): MapFieldInstance {
  if (!isPlainObject(rawValue)) {
    field.entries = [];
    return setUnparsedData(field, rawValue);
  }

  field.entries = Object.entries(rawValue).map(([key, value]) => ({
    key,
    valueField: populateFieldInstance(cloneFieldInstance(field.valueField as Field), value, context),
  }));
  return field;
}

function populateVariantField(
  field: VariantFieldInstance,
  rawValue: unknown,
  context: ParseContext,
): VariantFieldInstance {
  const rawObject = isPlainObject(rawValue) ? rawValue : null;

  field.identityField = populateFieldInstance(
    field.identityField,
    rawObject?.[field.identityField.schemaKey],
    context,
  ) as VariantFieldInstance["identityField"];
  field.selectedIdentity = typeof field.identityField.value === "string" ? field.identityField.value : undefined;

  const activeVariantSchema = field.selectedIdentity
    ? field.variantsByIdentity[field.selectedIdentity] ?? null
    : null;

  field.activeVariantField = activeVariantSchema
    ? populateFieldInstance(cloneFieldInstance(activeVariantSchema), rawObject, context)
    : null;
  field.unparsedData =
    !rawObject || (field.selectedIdentity && activeVariantSchema) || rawValue === undefined
      ? !rawObject && rawValue !== undefined
        ? rawValue
        : undefined
      : rawObject;

  return field;
}

function populateRefField(
  field: RefFieldInstance,
  rawValue: unknown,
  context: ParseContext,
): RefFieldInstance {
  const resolvedField = context.resolvedRefsByRef.get(field.$ref);

  if (resolvedField === null) {
    field.resolvedField = null;
    return field;
  }

  if (!resolvedField) {
    return field;
  }

  field.resolvedField = populateFieldInstance(
    cloneFieldInstance(applyRefMetadata(field, resolvedField)),
    rawValue,
    context,
  );
  return field;
}

function populateInlineOrReferenceField(
  field: InlineOrReferenceFieldInstance,
  rawValue: unknown,
  context: ParseContext,
): InlineOrReferenceFieldInstance {
  if (typeof rawValue === "string") {
    field.stringField = populateFieldInstance(field.stringField, rawValue, context) as InlineOrReferenceFieldInstance["stringField"];
    field.mode = "string";
    field.stringValue = typeof field.stringField.value === "string" ? field.stringField.value : undefined;
    return field;
  }

  if (isPlainObject(rawValue)) {
    field.mode = "inline";
    field.inlineValueField = populateFieldInstance(
      cloneFieldInstance(field.inlineField as Field),
      rawValue,
      context,
    );
    return field;
  }

  field.mode = "empty";
  field.unparsedData = rawValue !== undefined ? rawValue : undefined;
  return field;
}

function populateRawPayloadField<
  TField extends RawJsonFieldInstance | TimelineFieldInstance | WeightedTimelineFieldInstance,
>(field: TField, rawValue: unknown): TField {
  field.unparsedData = rawValue !== undefined ? rawValue : undefined;
  return field;
}

function cloneFieldInstance<TField extends Field>(field: TField): TField & FieldInstance {
  return structuredClone($state.snapshot(field)) as TField & FieldInstance;
}

function setUnparsedData<TField extends FieldInstance>(field: TField, rawValue: unknown): TField {
  field.unparsedData = rawValue !== undefined ? rawValue : undefined;
  return field;
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function applyRefMetadata(field: RefField, resolvedField: Field): Field {
  return {
    ...resolvedField,
    schemaKey: field.schemaKey ?? resolvedField.schemaKey,
    title: field.title ?? resolvedField.title,
    section: field.section ?? resolvedField.section,
    markdownDescription: field.markdownDescription ?? resolvedField.markdownDescription,
    collapsedByDefault: field.collapsedByDefault ?? resolvedField.collapsedByDefault,
    nullable: field.nullable ?? resolvedField.nullable,
  };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exhaustiveField(field: never): never {
  throw new Error(`Unsupported field type: ${JSON.stringify(field)}`);
}
