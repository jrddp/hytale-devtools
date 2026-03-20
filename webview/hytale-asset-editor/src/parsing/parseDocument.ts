import type {
  ArrayField,
  AssetDefinition,
  BooleanField,
  ColorField,
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
} from "../../../../src/shared/fieldTypes";
import { isObject } from "../../../../src/shared/typeUtils";
import { transferMetadata } from "../components/fieldHelpers";
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
  parentData,
}: {
  text: string;
  assetDefinition: AssetDefinition;
  assetsByRef: Record<string, AssetDefinition>;
  parentData?: unknown;
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
    rootField: populateFieldInstance(
      cloneFieldInstance(assetDefinition.rootField),
      documentRoot,
      parentData,
      {
        assetsByRef,
      },
    ),
  };
}

export function createEmptyFieldInstance<TField extends Field>(
  field: TField,
  assetsByRef: Record<string, AssetDefinition>,
): TField & FieldInstance {
  return populateFieldInstance(
    cloneFieldInstance(field),
    undefined,
    undefined,
    {
      assetsByRef,
    },
  ) as TField & FieldInstance;
}

function populateFieldInstance<TField extends Field>(
  field: TField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): TField & FieldInstance {
  switch (field.type) {
    case "string":
      return populateStringField(field, rawData, parentData);
    case "number":
      return populateNumberField(field, rawData, parentData);
    case "boolean":
      return populateBooleanField(field, rawData, parentData);
    case "color":
      return populateColorField(field, rawData, parentData);
    case "object":
      return populateObjectField(field, rawData, parentData, context);
    case "array":
      return populateArrayField(field, rawData, parentData, context);
    case "map":
      return populateMapField(field, rawData, parentData, context);
    case "variant":
      return populateVariantField(field, rawData, parentData, context);
    case "ref":
      return populateRefField(field, rawData, parentData, context);
    case "inlineOrReference":
      return populateInlineOrReferenceField(field, rawData, parentData, context);
    case "timeline":
      return populateTimelineField(field, rawData, parentData);
    case "weightedTimeline":
      return populateWeightedTimelineField(field, rawData, parentData);
    case "rawJson":
      return populateRawJsonField(field, rawData, parentData);
    default:
      throw new Error(`Unsupported field type: ${JSON.stringify(field)}`);
  }
}

function populateStringField(
  field: StringField,
  rawData: unknown,
  parentData: unknown,
): StringFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = rawData as string | undefined;
  if (field.inheritsValue && parentData !== undefined) {
    fieldInstance.inheritedValue = parentData as string;
  }
  return fieldInstance;
}

function populateNumberField(
  field: NumberField,
  rawData: unknown,
  parentData: unknown,
): NumberFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = rawData as number | string | undefined;
  if (field.inheritsValue && parentData !== undefined) {
    fieldInstance.inheritedValue = parentData as number | string;
  }
  return fieldInstance;
}

function populateBooleanField(
  field: BooleanField,
  rawData: unknown,
  parentData: unknown,
): BooleanFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = rawData as boolean | undefined;
  if (field.inheritsValue && parentData !== undefined) {
    fieldInstance.inheritedValue = parentData as boolean;
  }
  return fieldInstance;
}

function populateColorField(
  field: ColorField,
  rawData: unknown,
  parentData: unknown,
): ColorFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = rawData as string | undefined;
  if (field.inheritsValue && parentData !== undefined) {
    fieldInstance.inheritedValue = parentData as string;
  }
  return fieldInstance;
}

function populateObjectField(
  field: ObjectField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): ObjectFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  const rawDataObject = isObject(rawData) ? rawData : undefined;
  const parentDataObject = isObject(parentData) ? parentData : undefined;
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

  if (!rawDataObject && !parentDataObject) {
    return fieldInstance;
  }

  for (const schemaKey of schemaKeys) {
    const childData = rawDataObject?.[schemaKey];
    const childsParentData = parentDataObject?.[schemaKey];

    fieldInstance.properties[schemaKey] = populateFieldInstance(
      cloneFieldInstance(schemaProperties[schemaKey]),
      childData,
      childsParentData,
      context,
    );
  }

  if (!rawDataObject) {
    return fieldInstance;
  }

  // persist unparsed data (such as $NodeEditorMetadata)
  for (const [schemaKey, childData] of Object.entries(rawDataObject)) {
    if (!schemaKeys.has(schemaKey)) {
      fieldInstance.unparsedData[schemaKey] = childData;
    }
  }

  return fieldInstance;
}

function populateArrayField(
  field: ArrayField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): ArrayFieldInstance {
  const itemsField = field.items;
  const rawItems = Array.isArray(rawData) ? rawData : undefined;
  const parentItems = Array.isArray(parentData) ? parentData : undefined;
  const fieldInstance = cloneFieldInstance(field) as ArrayFieldInstance;
  fieldInstance.items = [];
  fieldInstance.inheritedItems = [];
  fieldInstance.itemFieldTypes = itemsField;
  if (Array.isArray(itemsField)) {
    fieldInstance.items = itemsField.map((itemField, index) => {
      const item = populateFieldInstance(
        cloneFieldInstance(itemField),
        rawItems?.[index],
        parentItems?.[index],
        context,
      );
      item.schemaKey = index.toString();
      return item;
    });
    fieldInstance.inheritedItems = itemsField.map((itemField, index) => {
      const item = populateFieldInstance(
        cloneFieldInstance(itemField),
        parentItems?.[index],
        undefined,
        context,
      );
      item.schemaKey = index.toString();
      return item;
    });
    fieldInstance.isTuple = true;
    return fieldInstance;
  }

  if (rawItems) {
    fieldInstance.items = rawItems.map((rawItem, index) => {
      const item = populateFieldInstance(
        cloneFieldInstance(itemsField),
        rawItem,
        parentItems?.[index],
        context,
      );
      item.schemaKey = index.toString();
      return item;
    });
  }

  if (parentItems) {
    fieldInstance.inheritedItems = parentItems.map((parentItem, index) => {
      const item = populateFieldInstance(
        cloneFieldInstance(itemsField),
        parentItem,
        undefined,
        context,
      );
      item.schemaKey = index.toString();
      return item;
    });
  }

  fieldInstance.isTuple = false;
  return fieldInstance;
}

function populateMapField(
  field: MapField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): MapFieldInstance {
  const rawEntries = isObject(rawData) ? rawData : undefined;
  const parentEntries = isObject(parentData) ? parentData : undefined;
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.entries = [];
  fieldInstance.inheritedEntries = [];

  if (rawEntries) {
    fieldInstance.entries = Object.entries(rawEntries).map(([key, value]) => ({
      key,
      valueField: populateFieldInstance(
        cloneFieldInstance(field.valueField as Field),
        value,
        parentEntries?.[key],
        context,
      ),
    }));
  }

  if (parentEntries) {
    fieldInstance.inheritedEntries = Object.entries(parentEntries).map(([key, value]) => ({
      key,
      valueField: populateFieldInstance(
        cloneFieldInstance(field.valueField as Field),
        value,
        undefined,
        context,
      ),
    }));
  }

  return fieldInstance;
}

function populateVariantField(
  field: VariantField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): VariantFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  const rawDataObject = isObject(rawData) ? rawData : undefined;
  const parentDataObject = isObject(parentData) ? parentData : undefined;
  const storedIdentity = rawDataObject?.[field.identityField.schemaKey];
  const inheritedIdentity = parentDataObject?.[field.identityField.schemaKey];
  const effectiveIdentity = storedIdentity ?? inheritedIdentity ?? field.identityField.default;

  fieldInstance.identityField = populateFieldInstance(
    cloneFieldInstance(field.identityField),
    storedIdentity,
    inheritedIdentity,
    context,
  );

  if (effectiveIdentity) {
    let variantMatch = field.variantsByIdentity[effectiveIdentity];
    if (variantMatch.type === "ref") {
      const ref = variantMatch.$ref;
      variantMatch = context.assetsByRef[ref]?.rootField as ObjectField | undefined;
      if (!variantMatch) {
        throw new Error(`Could not resolve asset reference: ${ref}`);
      }
    }
    fieldInstance.activeVariant = populateFieldInstance(
      cloneFieldInstance(variantMatch),
      rawDataObject,
      parentDataObject,
      context,
    );
    fieldInstance.activeVariant.properties[field.identityField.schemaKey] =
      fieldInstance.identityField;
    fieldInstance.activeVariant = transferMetadata(field, fieldInstance.activeVariant);
  }

  return fieldInstance;
}

function populateRefField(
  field: RefField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): FieldInstance {
  const resolvedField = context.assetsByRef[field.$ref]?.rootField;

  if (!resolvedField) {
    throw new Error(`Resolved field not found for reference: ${field.$ref}. Assets supported: ${Object.keys(context.assetsByRef).join(", ")}`);
  }

  return populateFieldInstance(
    transferMetadata(field, cloneFieldInstance(resolvedField)),
    rawData,
    parentData,
    context,
  );
}

function populateInlineOrReferenceField(
  field: InlineOrReferenceField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): InlineOrReferenceFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.activeField = populateInlineOrReferenceActiveField(
    field,
    rawData,
    parentData,
    context,
  );
  fieldInstance.inheritedActiveField = populateInlineOrReferenceActiveField(
    field,
    parentData,
    undefined,
    context,
  );
  return fieldInstance;
}

function populateTimelineField(
  field: TimelineField,
  rawData: unknown,
  parentData: unknown,
): TimelineFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.unparsedData = rawData !== undefined ? rawData : undefined;
  if (field.inheritsValue && parentData !== undefined) {
    fieldInstance.inheritedUnparsedData = parentData;
  }
  return fieldInstance;
}

function populateRawJsonField(
  field: RawJsonField,
  rawData: unknown,
  parentData: unknown,
): RawJsonFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.value = stringifyRawJsonValue(rawData);
  if (field.inheritsValue && parentData !== undefined) {
    fieldInstance.inheritedValue = stringifyRawJsonValue(parentData);
  }
  return fieldInstance;
}

function populateWeightedTimelineField(
  field: WeightedTimelineField,
  rawData: unknown,
  parentData: unknown,
): WeightedTimelineFieldInstance {
  const fieldInstance = cloneFieldInstance(field);
  fieldInstance.unparsedData = rawData;
  if (field.inheritsValue && parentData !== undefined) {
    fieldInstance.inheritedUnparsedData = parentData;
  }
  return fieldInstance;
}

function populateInlineOrReferenceActiveField(
  field: InlineOrReferenceField,
  data: unknown,
  parentData: unknown,
  context: ParseContext,
): StringFieldInstance | ObjectFieldInstance {
  if (data === undefined) {
    return createEmptyFieldInstance(field.stringField, context.assetsByRef);
  }

  if (typeof data === "string") {
    return populateStringField(
      field.stringField,
      data,
      typeof parentData === "string" ? parentData : undefined,
    ) as StringFieldInstance;
  }

  if (isObject(data)) {
    return populateFieldInstance(
      field.inlineField,
      data,
      isObject(parentData) ? parentData : undefined,
      context,
    ) as ObjectFieldInstance;
  }

  return createEmptyFieldInstance(field.stringField, context.assetsByRef);
}

function stringifyRawJsonValue(rawData: unknown): string {
  return isObject(rawData) ? JSON.stringify(rawData, null, 2) : "{\n\n}";
}

function cloneFieldInstance<TField extends Field>(field: TField): TField & FieldInstance {
  return structuredClone(field) as TField & FieldInstance;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
