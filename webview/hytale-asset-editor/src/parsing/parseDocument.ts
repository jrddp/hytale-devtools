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
  parentDataByName?: Record<string, Record<string, unknown>>;
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
  parentDataByName,
}: {
  text: string;
  assetDefinition: AssetDefinition;
  assetsByRef: Record<string, AssetDefinition>;
  parentData?: unknown;
  parentDataByName?: Record<string, Record<string, unknown>>;
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

  const rootField = populateFieldInstance(
    cloneFieldInstance(assetDefinition.rootField),
    documentRoot,
    parentData,
    {
      assetsByRef,
      parentDataByName,
    },
  );
  assignFieldInstancePaths(rootField, "");

  return {
    status: "ready",
    rootField,
  };
}

export function createEmptyFieldInstance<TField extends Field>(
  field: TField,
  assetsByRef: Record<string, AssetDefinition>,
): TField & FieldInstance {
  const fieldInstance = populateFieldInstance(
    cloneFieldInstance(field),
    undefined,
    undefined,
    {
      assetsByRef,
    },
  ) as TField & FieldInstance;
  assignFieldInstancePaths(fieldInstance, getDefaultFieldPath(fieldInstance));
  return fieldInstance;
}

export function assignFieldInstancePaths<TField extends FieldInstance>(
  field: TField,
  basePath = "",
): TField {
  field.fieldPath = basePath;

  switch (field.type) {
    case "object":
      for (const [schemaKey, childField] of Object.entries(field.properties)) {
        childField.schemaKey = schemaKey;
        assignFieldInstancePaths(childField, appendFieldPath(basePath, schemaKey));
      }
      return field;
    case "array":
      for (const [index, item] of field.items.entries()) {
        item.schemaKey = index.toString();
        assignFieldInstancePaths(item, appendFieldPath(basePath, index.toString()));
      }
      for (const [index, item] of field.inheritedItems.entries()) {
        item.schemaKey = index.toString();
        assignFieldInstancePaths(item, appendFieldPath(basePath, index.toString()));
      }
      return field;
    case "map":
      for (const entry of field.entries) {
        assignFieldInstancePaths(entry.valueField, appendFieldPath(basePath, entry.key));
      }
      for (const entry of field.inheritedEntries) {
        assignFieldInstancePaths(entry.valueField, appendFieldPath(basePath, entry.key));
      }
      return field;
    case "variant":
      assignFieldInstancePaths(
        field.identityField,
        appendFieldPath(basePath, field.identityField.schemaKey),
      );
      if (field.activeVariant) {
        assignFieldInstancePaths(field.activeVariant, basePath);
      }
      return field;
    case "inlineOrReference":
      assignFieldInstancePaths(field.activeField, basePath);
      assignFieldInstancePaths(field.inheritedActiveField, basePath);
      return field;
    default:
      return field;
  }
}

function populateFieldInstance<TField extends Field>(
  field: TField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): TField & FieldInstance {
  let fieldInstance: TField & FieldInstance;

  switch (field.type) {
    case "string":
      fieldInstance = populateStringField(field, rawData, parentData) as TField & FieldInstance;
      break;
    case "number":
      fieldInstance = populateNumberField(field, rawData, parentData) as TField & FieldInstance;
      break;
    case "boolean":
      fieldInstance = populateBooleanField(field, rawData, parentData) as TField & FieldInstance;
      break;
    case "color":
      fieldInstance = populateColorField(field, rawData, parentData) as TField & FieldInstance;
      break;
    case "object":
      fieldInstance = populateObjectField(field, rawData, parentData, context) as TField & FieldInstance;
      break;
    case "array":
      fieldInstance = populateArrayField(field, rawData, parentData, context) as TField & FieldInstance;
      break;
    case "map":
      fieldInstance = populateMapField(field, rawData, parentData, context) as TField & FieldInstance;
      break;
    case "variant":
      fieldInstance = populateVariantField(field, rawData, parentData, context) as TField & FieldInstance;
      break;
    case "ref":
      fieldInstance = populateRefField(field, rawData, parentData, context) as TField & FieldInstance;
      break;
    case "inlineOrReference":
      fieldInstance = populateInlineOrReferenceField(field, rawData, parentData, context) as TField & FieldInstance;
      break;
    case "timeline":
      fieldInstance = populateTimelineField(field, rawData, parentData) as TField & FieldInstance;
      break;
    case "weightedTimeline":
      fieldInstance = populateWeightedTimelineField(field, rawData, parentData) as TField & FieldInstance;
      break;
    case "rawJson":
      fieldInstance = populateRawJsonField(field, rawData, parentData) as TField & FieldInstance;
      break;
    default:
      throw new Error(`Unsupported field type: ${JSON.stringify(field)}`);
  }

  if (rawData === null) {
    fieldInstance.isNull = true;
  }

  return fieldInstance;
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
  const parentDataObject = resolveParentDataObject(rawDataObject, parentData, context);
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

  if (rawData !== undefined && !rawDataObject) {
    fieldInstance.rawFallback = rawData;
    return fieldInstance;
  }

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

  if (rawData !== undefined && !rawItems) {
    fieldInstance.rawFallback = rawData;
    return fieldInstance;
  }

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

  if (rawData !== undefined && !rawEntries) {
    fieldInstance.rawFallback = rawData;
    return fieldInstance;
  }

  if (rawEntries) {
    fieldInstance.entries = Object.entries(rawEntries).map(([key, value]) => {
      const valueField = populateFieldInstance(
        cloneFieldInstance(field.valueField as Field),
        value,
        parentEntries?.[key],
        context,
      );
      valueField.schemaKey = key;
      return {
        key,
        valueField,
      };
    });
  }

  if (parentEntries) {
    fieldInstance.inheritedEntries = Object.entries(parentEntries).map(([key, value]) => {
      const valueField = populateFieldInstance(
        cloneFieldInstance(field.valueField as Field),
        value,
        undefined,
        context,
      );
      valueField.schemaKey = key;
      return {
        key,
        valueField,
      };
    });
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
  const parentDataObject = resolveParentDataObject(rawDataObject, parentData, context);
  const storedIdentity = rawDataObject?.[field.identityField.schemaKey];
  const inheritedIdentity = parentDataObject?.[field.identityField.schemaKey];
  const effectiveIdentity = storedIdentity ?? inheritedIdentity ?? field.identityField.default;

  fieldInstance.identityField = populateFieldInstance(
    cloneFieldInstance(field.identityField),
    storedIdentity,
    inheritedIdentity,
    context,
  );

  const variantMatch = resolveVariantMatch(field, effectiveIdentity, context);
  if (variantMatch) {
    fieldInstance.activeVariant = populateFieldInstance(
      cloneFieldInstance(variantMatch),
      rawDataObject,
      parentDataObject,
      context,
    );
    fieldInstance.activeVariant.properties[field.identityField.schemaKey] =
      fieldInstance.identityField;
    fieldInstance.activeVariant = transferMetadata(field, fieldInstance.activeVariant);
  } else if (rawData !== undefined) {
    fieldInstance.rawFallback = rawData;
  }

  return fieldInstance;
}

function resolveVariantMatch(
  field: VariantField,
  effectiveIdentity: unknown,
  context: ParseContext,
): ObjectField | undefined {
  const variantMatch =
    typeof effectiveIdentity === "string"
      ? field.variantsByIdentity[effectiveIdentity]
      : getSingleDistinctVariantCandidate(field);
  if (!variantMatch) {
    return undefined;
  }

  if (variantMatch.type === "ref") {
    const ref = variantMatch.$ref;
    const resolvedField = context.assetsByRef[ref]?.rootField as ObjectField | undefined;
    if (!resolvedField) {
      return undefined;
    }
    return resolvedField;
  }

  return variantMatch;
}

function getSingleDistinctVariantCandidate(
  field: VariantField,
): ObjectField | RefField | undefined {
  const candidatesByIdentity = new Map<string | ObjectField, ObjectField | RefField>();
  for (const candidate of Object.values(field.variantsByIdentity)) {
    candidatesByIdentity.set(candidate.type === "ref" ? candidate.$ref : candidate, candidate);
  }

  return candidatesByIdentity.size === 1
    ? candidatesByIdentity.values().next().value
    : undefined;
}

function resolveParentDataObject(
  rawDataObject: Record<string, unknown> | undefined,
  parentData: unknown,
  context: ParseContext,
): Record<string, unknown> | undefined {
  const parentName = readParentName(rawDataObject);
  if (parentName) {
    return context.parentDataByName?.[parentName] ?? (isObject(parentData) ? parentData : undefined);
  }

  return isObject(parentData) ? parentData : undefined;
}

function readParentName(documentJson: unknown): string | undefined {
  if (!isObject(documentJson)) {
    return undefined;
  }

  const parent = documentJson.Parent;
  return typeof parent === "string" && parent.length > 0 ? parent : undefined;
}

function populateRefField(
  field: RefField,
  rawData: unknown,
  parentData: unknown,
  context: ParseContext,
): FieldInstance {
  const resolvedField = context.assetsByRef[field.$ref]?.rootField;

  if (!resolvedField) {
    const { $ref: _ref, ...rawJsonField } = field;
    return populateRawJsonField(
      {
        ...rawJsonField,
        type: "rawJson",
      },
      rawData,
      parentData,
    );
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
): StringFieldInstance | ObjectFieldInstance | VariantFieldInstance | RawJsonFieldInstance {
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
    ) as ObjectFieldInstance | VariantFieldInstance;
  }

  return populateRawJsonField(
    {
      ...field.stringField,
      type: "rawJson",
    },
    data,
    parentData,
  );
}

function stringifyRawJsonValue(rawData: unknown): string {
  return rawData === undefined ? "{\n\n}" : JSON.stringify(rawData, null, 2);
}

function cloneFieldInstance<TField extends Field>(field: TField): TField & FieldInstance {
  return structuredClone(field) as TField & FieldInstance;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function getDefaultFieldPath(field: Pick<Field, "schemaKey">): string {
  return field.schemaKey ? escapeFieldPathSegment(field.schemaKey) : "";
}

function appendFieldPath(parentPath: string, segment: string): string {
  const escapedSegment = escapeFieldPathSegment(segment);
  return parentPath ? `${parentPath}/${escapedSegment}` : escapedSegment;
}

function escapeFieldPathSegment(segment: string): string {
  if (segment.length === 0) {
    return "$empty";
  }

  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
