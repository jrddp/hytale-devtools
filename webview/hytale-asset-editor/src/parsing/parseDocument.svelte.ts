import type {
  ArrayField,
  BooleanField,
  Field,
  InlineOrReferenceField,
  MapField,
  NumberField,
  ObjectField,
  RawJsonField,
  RefField,
  StringField,
  TimelineField,
  VariantField,
  WeightedTimelineField,
} from "@shared/fieldTypes";
import { isObject } from "@shared/typeUtils";
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

  if (!isObject(documentRoot)) {
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
      const rawObject = isObject(rawValue) ? rawValue : null;

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
      if (!isObject(rawValue)) {
        return;
      }

      for (const value of Object.values(rawValue)) {
        collectReachableRefs(field.valueField, value, state);
      }
      return;
    }

    case "variant": {
      if (!isObject(rawValue)) {
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

      if (isObject(rawValue)) {
        collectReachableRefs(field.inlineField, rawValue, state);
      }
      return;
    }

    default:
      return;
  }
}

function populateFieldInstance<TField extends Field>(
  field: TField,
  rawValue: unknown,
  context: ParseContext,
): TField & FieldInstance {
  switch (field.type) {
    case "string":
      return populateStringField(field, rawValue);
    case "number":
      return populateNumberField(field, rawValue);
    case "boolean":
      return populateBooleanField(field, rawValue);
    case "color":
      return populateColorField(field, rawValue);
    case "object":
      return populateObjectField(field, rawValue, context);
    case "array":
      return populateArrayField(field, rawValue, context);
    case "map":
      return populateMapField(field, rawValue, context);
    case "variant":
      return populateVariantField(field, rawValue, context);
    case "ref":
      return populateRefField(field, rawValue, context);
    case "inlineOrReference":
      return populateInlineOrReferenceField(field, rawValue, context);
    case "timeline":
      return populateTimelineField(field, rawValue);
    case "weightedTimeline":
      return populateWeightedTimelineField(field, rawValue);
    case "rawJson":
      return populateRawJsonField(field, rawValue);
    default:
      throw new Error(`Unsupported field type: ${JSON.stringify(field)}`);
  }
}

function populateStringField(field: StringField, rawValue: unknown): StringFieldInstance {
  const fieldInstance = field as StringFieldInstance;
  fieldInstance.value = rawValue as string | undefined;
  return field;
}

function populateNumberField(field: NumberField, rawValue: unknown): NumberFieldInstance {
  const fieldInstance = field as NumberFieldInstance;
  fieldInstance.value = rawValue as number | undefined;
  return field;
}

function populateBooleanField(field: BooleanField, rawValue: unknown): BooleanFieldInstance {
  const fieldInstance = field as BooleanFieldInstance;
  fieldInstance.value = rawValue as boolean | undefined;
  return field;
}

function populateColorField(field: ColorFieldInstance, rawValue: unknown): ColorFieldInstance {
  const fieldInstance = field as ColorFieldInstance;
  fieldInstance.value = rawValue as string | undefined;
  return field;
}

function populateObjectField(
  field: ObjectField,
  rawValue: unknown,
  context: ParseContext,
): ObjectFieldInstance {
  const fieldInstance = field as ObjectFieldInstance;
  const schemaKeys = new Set(Object.keys(field.properties));
  fieldInstance.properties = Object.entries(field.properties).reduce(
    (properties, [schemaKey, childField]) => {
      properties[schemaKey] = createEmptyFieldInstance(childField, context.resolvedRefsByRef);
      return properties;
    },
    {} as Record<string, FieldInstance>,
  );
  fieldInstance.unparsedData = {};

  if (!rawValue) {
    return fieldInstance;
  }

  for (const [schemaKey, childData] of Object.entries(rawValue)) {
    if (schemaKeys.has(schemaKey)) {
      fieldInstance.properties[schemaKey] = populateFieldInstance(
        field.properties[schemaKey] as FieldInstance,
        childData,
        context,
      );
    } else {
      fieldInstance.unparsedData[schemaKey] = childData;
    }
  }

  return fieldInstance;
}

function populateArrayField(
  field: ArrayField,
  rawValue: unknown,
  context: ParseContext,
): ArrayFieldInstance {
  const { items: itemsField, ...fieldBase } = field;
  const fieldInstance = fieldBase as ArrayFieldInstance;
  fieldInstance.items = [];
  fieldInstance.itemFieldTypes = itemsField;
  if (Array.isArray(itemsField)) {
    fieldInstance.isTuple = true;
    fieldInstance.items = itemsField.map((itemField, index) =>
      populateFieldInstance(cloneFieldInstance(itemField), rawValue?.[index], context),
    );
    return fieldInstance;
  }

  if (Array.isArray(rawValue)) {
    fieldInstance.items = rawValue.map((item, index) =>
      populateFieldInstance(cloneFieldInstance(itemsField), item, context),
    );
  }

  return fieldInstance;
}

function populateMapField(
  field: MapField,
  rawValue: unknown,
  context: ParseContext,
): MapFieldInstance {
  const fieldInstance = field as MapFieldInstance;
  fieldInstance.entries = [];

  if (!rawValue) {
    return fieldInstance;
  }

  fieldInstance.entries = Object.entries(rawValue).map(([key, value]) => ({
    key,
    valueField: populateFieldInstance(
      cloneFieldInstance(field.valueField as Field),
      value,
      context,
    ),
  }));
  return fieldInstance;
}

function populateVariantField(
  field: VariantField,
  rawValue: unknown,
  context: ParseContext,
): VariantFieldInstance {
  const fieldInstance = field as VariantFieldInstance;
  fieldInstance.identityField = populateFieldInstance(
    field.identityField,
    rawValue?.[field.identityField.schemaKey],
    context,
  );
  if (fieldInstance.identityField.value) {
    fieldInstance.activeVariant = populateFieldInstance(
      field.variantsByIdentity[fieldInstance.identityField.value],
      rawValue,
      context,
    );
    fieldInstance.activeVariant.properties[fieldInstance.identityField.schemaKey] =
      fieldInstance.identityField;
  }

  return field;
}

function populateRefField(
  field: RefField,
  rawValue: unknown,
  context: ParseContext,
): RefFieldInstance {
  const fieldInstance = field as RefFieldInstance;
  const resolvedField = context.resolvedRefsByRef.get(field.$ref);

  if (resolvedField === null) {
    fieldInstance.resolvedField = null;
    return fieldInstance;
  }

  if (!resolvedField) {
    return fieldInstance;
  }

  fieldInstance.resolvedField = populateFieldInstance(
    cloneFieldInstance(applyRefMetadata(field, resolvedField)),
    rawValue,
    context,
  );
  return field;
}

function populateInlineOrReferenceField(
  field: InlineOrReferenceField,
  rawValue: unknown,
  context: ParseContext,
): InlineOrReferenceFieldInstance {
  const fieldInstance = field as InlineOrReferenceFieldInstance;

  if (!rawValue) {
    fieldInstance.activeField = createEmptyFieldInstance(
      field.stringField,
      context.resolvedRefsByRef,
    );
    return fieldInstance;
  }

  if (typeof rawValue === "string") {
    fieldInstance.activeField = populateStringField(
      field.stringField,
      rawValue,
    ) as StringFieldInstance;
    return fieldInstance;
  }

  fieldInstance.activeField = populateFieldInstance(
    field.inlineField,
    rawValue,
    context,
  ) as ObjectFieldInstance;
  return fieldInstance;
}

function populateTimelineField(field: TimelineField, rawValue: unknown): TimelineFieldInstance {
  const fieldInstance = field as TimelineFieldInstance;
  fieldInstance.unparsedData = rawValue !== undefined ? rawValue : undefined;
  return fieldInstance;
}

function populateRawJsonField(field: RawJsonField, rawValue: unknown): RawJsonFieldInstance {
  const fieldInstance = field as RawJsonFieldInstance;
  fieldInstance.value = isObject(rawValue) ? JSON.stringify(rawValue, null, 2) : "{\n\n}";
  return fieldInstance;
}

function populateWeightedTimelineField(
  field: WeightedTimelineField,
  rawValue: unknown,
): WeightedTimelineFieldInstance {
  const fieldInstance = field as WeightedTimelineFieldInstance;
  fieldInstance.unparsedData = rawValue;
  return fieldInstance;
}

function cloneFieldInstance<TField extends Field>(field: TField): TField & FieldInstance {
  return structuredClone($state.snapshot(field)) as TField & FieldInstance;
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
