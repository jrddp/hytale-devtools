import type {
  ArrayField,
  AssetDefinition,
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
import { transferMetadata } from "src/components/fieldHelpers";
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
  RootFieldInstance,
  StringFieldInstance,
  TimelineFieldInstance,
  VariantFieldInstance,
  WeightedTimelineFieldInstance,
} from "./fieldInstances";

type ParseContext = {
  assetsByRef: Record<string, AssetDefinition>;
};

export type ParseDocumentResult =
  | {
      status: "ready";
      rootField: RootFieldInstance;
    }
  | {
      status: "error";
      error: string;
    };

export function parseDocumentText({
  text,
  assetDefinition,
  assetsByRef,
}: {
  text: string;
  assetDefinition: AssetDefinition;
  assetsByRef: Record<string, AssetDefinition>;
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

  return {
    status: "ready",
    rootField: populateFieldInstance(cloneFieldInstance(assetDefinition.rootField), documentRoot, {
      assetsByRef,
    }),
  };
}

export function createEmptyFieldInstance<TField extends Field>(
  field: TField,
  assetsByRef: Record<string, AssetDefinition>,
): TField & FieldInstance {
  return populateFieldInstance(cloneFieldInstance(field), undefined, {
    assetsByRef,
  }) as TField & FieldInstance;
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
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = rawValue as string | undefined;
  return field;
}

function populateNumberField(field: NumberField, rawValue: unknown): NumberFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = rawValue as number | undefined;
  return field;
}

function populateBooleanField(field: BooleanField, rawValue: unknown): BooleanFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = rawValue as boolean | undefined;
  return field;
}

function populateColorField(field: ColorFieldInstance, rawValue: unknown): ColorFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = rawValue as string | undefined;
  return field;
}

function populateObjectField(
  field: ObjectField,
  rawValue: unknown,
  context: ParseContext,
): ObjectFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  const schemaProperties = field.properties;
  const schemaKeys = new Set(Object.keys(schemaProperties));
  fieldInstance.properties = Object.entries(schemaProperties).reduce(
    (properties, [schemaKey, childField]) => {
      properties[schemaKey] = createEmptyFieldInstance(childField, context.assetsByRef);
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
        cloneFieldInstance(schemaProperties[schemaKey]),
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
  const itemsField = field.items;
  const fieldInstance = cloneFieldInstance(field) as ArrayFieldInstance;
  fieldInstance.items = [];
  fieldInstance.itemFieldTypes = itemsField;
  if (Array.isArray(itemsField)) {
    fieldInstance.items = itemsField.map((itemField, index) => {
      const item = populateFieldInstance(cloneFieldInstance(itemField), rawValue?.[index], context);
      item.schemaKey = index.toString();
      return item;
    });
    fieldInstance.isTuple = true;
    return fieldInstance;
  }

  if (Array.isArray(rawValue)) {
    fieldInstance.items = rawValue.map((rawItem, index) => {
      const item = populateFieldInstance(cloneFieldInstance(itemsField), rawItem, context);
      item.schemaKey = index.toString();
      return item;
    });
  }

  fieldInstance.isTuple = false;
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
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.identityField = populateFieldInstance(
    cloneFieldInstance(field.identityField),
    rawValue?.[field.identityField.schemaKey],
    context,
  );
  if (fieldInstance.identityField.value) {
    let variantMatch = field.variantsByIdentity[fieldInstance.identityField.value];
    if (variantMatch.type === "ref") {
      variantMatch = context.assetsByRef[variantMatch.$ref]?.rootField as ObjectField | undefined;
    }
    if (!variantMatch) {
      throw new Error(`Could not resolve asset reference: ${fieldInstance.identityField.value}`);
    }
    fieldInstance.activeVariant = populateFieldInstance(
      cloneFieldInstance(variantMatch),
      rawValue,
      context,
    );
  }

  return fieldInstance;
}

function populateRefField(
  field: RefField,
  rawValue: unknown,
  context: ParseContext,
): FieldInstance {
  const resolvedField = context.assetsByRef[field.$ref]?.rootField;

  if (!resolvedField) {
    throw new Error("Resolved field not found");
  }

  return populateFieldInstance(
    transferMetadata(field, cloneFieldInstance(resolvedField)),
    rawValue,
    context,
  );
}

function populateInlineOrReferenceField(
  field: InlineOrReferenceField,
  rawValue: unknown,
  context: ParseContext,
): InlineOrReferenceFieldInstance {
  const fieldInstance = cloneFieldInstance(field);

  if (!rawValue) {
    fieldInstance.activeField = createEmptyFieldInstance(field.stringField, context.assetsByRef);
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
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.unparsedData = rawValue !== undefined ? rawValue : undefined;
  return fieldInstance;
}

function populateRawJsonField(field: RawJsonField, rawValue: unknown): RawJsonFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = isObject(rawValue) ? JSON.stringify(rawValue, null, 2) : "{\n\n}";
  return fieldInstance;
}

function populateWeightedTimelineField(
  field: WeightedTimelineField,
  rawValue: unknown,
): WeightedTimelineFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.unparsedData = rawValue;
  return fieldInstance;
}

function cloneFieldInstance<TField extends Field>(field: TField): TField & FieldInstance {
  return structuredClone($state.snapshot(field)) as TField & FieldInstance;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
