import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
  NpcDescriptorDocument,
} from "@shared/npc-role-editor/descriptorTypes";
import type { NpcAnimationAutocompleteKind } from "@shared/npc-role-editor/animationAutocomplete";
import { resolveNpcDescriptorAssetSymbolLookup } from "@shared/npc-role-editor/assetSymbolLookup";
import type { IndexReference } from "@shared/indexTypes";
import type { NpcStateAutocompleteKind } from "@shared/npc-role-editor/stateAutocomplete";
import { isNpcComputeJson, isRecord } from "./parsing/documentTypes";
import type { NpcPropertyField } from "./propertyTypes";
import {
  cloneJsonLike,
  humanize,
  inferItemTypeFromPrimitiveList,
  isPrimitiveListItem,
  normalizeFlagValue,
  normalizeTypeHint,
  toOptionalDisplayString,
} from "./propertyFieldUtilities";

const CONTENT_WRAPPER_KEYS = new Set([
  "Reference",
  "Local",
  "Nullable",
  "Interfaces",
  "Modify",
  "_ExportStates",
  "_InterfaceParameters",
]);

const TYPED_RICH_OBJECT_SHAPES = new Set(["Action", "BodyMotion", "HeadMotion", "MotionController"]);

export function isRichObjectField(field: NpcPropertyField): boolean {
  return field.kind === "richObject";
}

export function createRichObjectField({
  key,
  label,
  fieldPath,
  shapeKey,
  value,
  descriptors,
  description,
  canUnset = true,
  isSet = true,
  seedDefaults = false,
}: {
  key: string;
  label: string;
  fieldPath: string;
  shapeKey: string;
  value: unknown;
  descriptors: NpcDescriptorDocument;
  description?: string;
  canUnset?: boolean;
  isSet?: boolean;
  seedDefaults?: boolean;
}): NpcPropertyField {
  if (shapeKey === "ActionList") {
    return createRichObjectArrayField({
      key,
      label,
      fieldPath,
      shapeKey,
      itemShapeKey: "Action",
      value,
      descriptors,
      description,
      canUnset,
      isSet,
      seedDefaults,
    });
  }

  if (shapeKey === "MotionControllerList") {
    return createRichObjectArrayField({
      key,
      label,
      fieldPath,
      shapeKey,
      itemShapeKey: "MotionController",
      value,
      descriptors,
      description,
      canUnset,
      isSet,
      seedDefaults,
    });
  }

  if (TYPED_RICH_OBJECT_SHAPES.has(shapeKey)) {
    return createTypedRichObjectField({
      key,
      label,
      fieldPath,
      shapeKey,
      value,
      descriptors,
      description,
      canUnset,
      isSet,
      seedDefaults,
    });
  }

  return createFixedRichObjectField({
    key,
    label,
    fieldPath,
    shapeKey,
    value,
    descriptors,
    description,
    canUnset,
    isSet,
    seedDefaults,
  });
}

export function setRichObjectVariantType(
  field: NpcPropertyField,
  nextType: string,
  descriptors: NpcDescriptorDocument,
): boolean {
  if (
    field.kind !== "richObject" ||
    field.structureKind !== "object" ||
    !field.shapeKey ||
    !TYPED_RICH_OBJECT_SHAPES.has(field.shapeKey)
  ) {
    return false;
  }

  const trimmedType = nextType.trim();
  if (!trimmedType) {
    field.variantType = null;
    field.childFields = [];
    field.keyOrder = [];
    field.preservedData = undefined;
    field.value = { kind: "literal", value: {} };
    field.isSet = true;
    return true;
  }

  const descriptor = resolveNamedDescriptor(field.shapeKey, trimmedType, descriptors);
  if (!descriptor) {
    return false;
  }

  const previousOnceField = (field.childFields ?? []).find(childField => childField.key === "Once");
  const nextFields = buildStructuredObjectFields({
    descriptor,
    fieldPath: field.fieldPath,
    descriptors,
    seedDefaults: true,
  });
  if (previousOnceField) {
    const nextOnceField = nextFields.find(childField => childField.key === "Once");
    if (nextOnceField) {
      nextOnceField.isSet = previousOnceField.isSet;
      nextOnceField.value =
        previousOnceField.value.kind === "compute"
          ? {
              kind: "compute",
              expression: previousOnceField.value.expression,
            }
          : {
              kind: "literal",
              value: cloneJsonLike(previousOnceField.value.value),
            };
    }
  }

  field.variantType = trimmedType;
  field.childFields = nextFields;
  field.keyOrder = [];
  field.preservedData = undefined;
  field.value = { kind: "literal", value: {} };
  field.isSet = true;

  seedSpecialRichObjectDefaults(field, descriptors);
  return true;
}

export function addRichObjectProperty(
  field: NpcPropertyField,
  propertyKey: string,
  descriptors: NpcDescriptorDocument,
): boolean {
  if (field.kind !== "richObject" || field.structureKind !== "object") {
    return false;
  }

  const childField = field.childFields?.find(candidate => candidate.key === propertyKey);
  if (!childField || childField.isSet !== false) {
    return false;
  }

  childField.isSet = true;
  if (!(field.keyOrder ?? []).includes(propertyKey)) {
    field.keyOrder = [...(field.keyOrder ?? []), propertyKey];
  }

  if (childField.kind === "richObject" && childField.shapeKey === "Action" && !childField.variantType) {
    seedInlineActionField(childField, descriptors);
  }

  return true;
}

export function addRichObjectArrayItem(
  field: NpcPropertyField,
  descriptors: NpcDescriptorDocument,
): boolean {
  if (
    field.kind !== "richObject" ||
    field.structureKind !== "array" ||
    !field.itemShapeKey
  ) {
    return false;
  }

  const nextIndex = field.childFields?.length ?? 0;
  const nextItem = createRichObjectField({
    key: String(nextIndex),
    label: formatStructuredArrayItemLabel(field.itemShapeKey, nextIndex),
    fieldPath: `${field.fieldPath}[${nextIndex}]`,
    shapeKey: field.itemShapeKey,
    value: undefined,
    descriptors,
    canUnset: true,
    isSet: true,
    seedDefaults: true,
  });
  seedStructuredArrayItemDefaults(field, nextItem, descriptors);

  field.childFields = [...(field.childFields ?? []), nextItem];
  field.isSet = true;
  syncStructuredFieldPaths(field);
  return true;
}

export function syncStructuredFieldPaths(field: NpcPropertyField): void {
  if (field.kind !== "richObject") {
    return;
  }

  if (field.structureKind === "array") {
    (field.childFields ?? []).forEach((childField, index) => {
      childField.key = String(index);
      childField.fieldPath = `${field.fieldPath}[${index}]`;
      childField.label = formatStructuredArrayItemLabel(
        field.itemShapeKey ?? childField.shapeKey ?? childField.label,
        index,
        field.itemShapeKey === "MotionController" ? childField.variantType ?? undefined : undefined,
      );
      syncStructuredFieldPaths(childField);
    });
    return;
  }

  for (const childField of field.childFields ?? []) {
    childField.fieldPath = `${field.fieldPath}.${childField.key}`;
    syncStructuredFieldPaths(childField);
  }
}

export function describeRichObjectShape(
  shapeKey: string,
  descriptors: NpcDescriptorDocument,
): string | undefined {
  if (shapeKey === "ActionList") {
    return "Ordered list of action entries.";
  }

  const descriptor =
    resolveFixedShapeDescriptor(shapeKey, descriptors) ??
    descriptors.find(candidate => candidate.Category === shapeKey);

  return (
    toOptionalDisplayString(descriptor?.ShortDescription) ??
    toOptionalDisplayString(descriptor?.LongDescription)
  );
}

export function isContentWrapperShape(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).some(key => CONTENT_WRAPPER_KEYS.has(key));
}

function createTypedRichObjectField({
  key,
  label,
  fieldPath,
  shapeKey,
  value,
  descriptors,
  description,
  canUnset,
  isSet,
  seedDefaults,
}: {
  key: string;
  label: string;
  fieldPath: string;
  shapeKey: string;
  value: unknown;
  descriptors: NpcDescriptorDocument;
  description?: string;
  canUnset: boolean;
  isSet: boolean;
  seedDefaults: boolean;
}): NpcPropertyField {
  if (value !== undefined && !isRecord(value)) {
    return createRawJsonFallbackStructuredField({
      key,
      label,
      fieldPath,
      value,
      description,
      canUnset,
      isSet,
    });
  }

  const rawObject = isRecord(value) ? value : undefined;
  const typeSuggestions = descriptors
    .filter(descriptor => descriptor.Category === shapeKey)
    .map(descriptor => descriptor.Name)
    .sort((left, right) => left.localeCompare(right));
  const variantType =
    typeof rawObject?.Type === "string" && typeSuggestions.includes(rawObject.Type)
      ? rawObject.Type
      : seedDefaults
        ? typeSuggestions[0] ?? null
        : null;
  const descriptor =
    variantType ? resolveNamedDescriptor(shapeKey, variantType, descriptors) : undefined;

  return {
    id: createStructuredFieldId(fieldPath),
    key,
    label,
    fieldPath,
    kind: "richObject",
    shapeKey,
    structureKind: "object",
    value: {
      kind: "literal",
      value: cloneJsonLike(rawObject ?? {}),
    },
    description:
      description ??
      toOptionalDisplayString(descriptor?.ShortDescription) ??
      toOptionalDisplayString(descriptor?.LongDescription) ??
      describeRichObjectShape(shapeKey, descriptors),
    childFields: descriptor
      ? buildStructuredObjectFields({
          descriptor,
          source: rawObject,
          fieldPath,
          descriptors,
          seedDefaults,
        })
      : [],
    keyOrder: rawObject ? Object.keys(rawObject).filter(propertyKey => propertyKey !== "Type") : [],
    preservedData: rawObject
      ? Object.fromEntries(
          Object.entries(rawObject)
            .filter(([propertyKey]) => propertyKey !== "Type")
            .filter(([propertyKey]) => !descriptor?.Attributes?.some(attribute => attribute.Name === propertyKey))
            .map(([propertyKey, propertyValue]) => [propertyKey, cloneJsonLike(propertyValue)]),
        )
      : undefined,
    variantType,
    typeSuggestions,
    computable: false,
    canRename: false,
    canChangeType: false,
    canUnset,
    isDescriptionEditable: false,
    isSet,
    ui: {},
  };
}

function createFixedRichObjectField({
  key,
  label,
  fieldPath,
  shapeKey,
  value,
  descriptors,
  description,
  canUnset,
  isSet,
  seedDefaults,
}: {
  key: string;
  label: string;
  fieldPath: string;
  shapeKey: string;
  value: unknown;
  descriptors: NpcDescriptorDocument;
  description?: string;
  canUnset: boolean;
  isSet: boolean;
  seedDefaults: boolean;
}): NpcPropertyField {
  if (value !== undefined && !isRecord(value)) {
    return createRawJsonFallbackStructuredField({
      key,
      label,
      fieldPath,
      value,
      description,
      canUnset,
      isSet,
    });
  }

  const descriptor = resolveFixedShapeDescriptor(shapeKey, descriptors);
  if (!descriptor) {
    return createRawJsonFallbackStructuredField({
      key,
      label,
      fieldPath,
      value,
      description,
      canUnset,
      isSet,
    });
  }

  const rawObject = isRecord(value) ? value : undefined;

  return {
    id: createStructuredFieldId(fieldPath),
    key,
    label,
    fieldPath,
    kind: "richObject",
    shapeKey,
    structureKind: "object",
    value: {
      kind: "literal",
      value: cloneJsonLike(rawObject ?? {}),
    },
    description:
      description ??
      toOptionalDisplayString(descriptor.ShortDescription) ??
      toOptionalDisplayString(descriptor.LongDescription) ??
      describeRichObjectShape(shapeKey, descriptors),
    childFields: buildStructuredObjectFields({
      descriptor,
      source: rawObject,
      fieldPath,
      descriptors,
      seedDefaults,
    }),
    keyOrder: rawObject ? Object.keys(rawObject) : [],
    preservedData: rawObject
      ? Object.fromEntries(
          Object.entries(rawObject)
            .filter(([propertyKey]) => !descriptor.Attributes?.some(attribute => attribute.Name === propertyKey))
            .map(([propertyKey, propertyValue]) => [propertyKey, cloneJsonLike(propertyValue)]),
        )
      : undefined,
    computable: false,
    canRename: false,
    canChangeType: false,
    canUnset,
    isDescriptionEditable: false,
    isSet,
    ui: {},
  };
}

function createRichObjectArrayField({
  key,
  label,
  fieldPath,
  shapeKey,
  itemShapeKey,
  value,
  descriptors,
  description,
  canUnset,
  isSet,
  seedDefaults,
}: {
  key: string;
  label: string;
  fieldPath: string;
  shapeKey: string;
  itemShapeKey: string;
  value: unknown;
  descriptors: NpcDescriptorDocument;
  description?: string;
  canUnset: boolean;
  isSet: boolean;
  seedDefaults: boolean;
}): NpcPropertyField {
  if (value !== undefined && !Array.isArray(value)) {
    return createRawJsonFallbackStructuredField({
      key,
      label,
      fieldPath,
      value,
      description,
      canUnset,
      isSet,
    });
  }

  const childFields = (Array.isArray(value) ? value : []).map((itemValue, index) =>
    createRichObjectField({
      key: String(index),
      label: formatStructuredArrayItemLabel(
        itemShapeKey,
        index,
        itemShapeKey === "MotionController" && isRecord(itemValue) && typeof itemValue.Type === "string"
          ? itemValue.Type
          : undefined,
      ),
      fieldPath: `${fieldPath}[${index}]`,
      shapeKey: itemShapeKey,
      value: itemValue,
      descriptors,
      canUnset: true,
      isSet: true,
      seedDefaults,
    }),
  );

  return {
    id: createStructuredFieldId(fieldPath),
    key,
    label,
    fieldPath,
    kind: "richObject",
    shapeKey,
    structureKind: "array",
    itemShapeKey,
    childFields,
    value: {
      kind: "literal",
      value: cloneJsonLike(Array.isArray(value) ? value : []),
    },
    description: description ?? describeRichObjectShape(shapeKey, descriptors),
    computable: false,
    canRename: false,
    canChangeType: false,
    canUnset,
    isDescriptionEditable: false,
    isSet,
    ui: {},
  };
}

function createRawJsonFallbackStructuredField({
  key,
  label,
  fieldPath,
  value,
  description,
  canUnset,
  isSet,
}: {
  key: string;
  label: string;
  fieldPath: string;
  value: unknown;
  description?: string;
  canUnset: boolean;
  isSet: boolean;
}): NpcPropertyField {
  return {
    id: createStructuredFieldId(fieldPath),
    key,
    label,
    fieldPath,
    kind: "rawJson",
    value: {
      kind: "literal",
      value: cloneJsonLike(value ?? {}),
    },
    description,
    computable: false,
    canRename: false,
    canChangeType: false,
    canUnset,
    isDescriptionEditable: false,
    isSet,
    ui: {},
  };
}

function buildStructuredObjectFields({
  descriptor,
  source,
  fieldPath,
  descriptors,
  seedDefaults,
}: {
  descriptor: NpcDescriptor;
  source?: Record<string, unknown>;
  fieldPath: string;
  descriptors: NpcDescriptorDocument;
  seedDefaults: boolean;
}): NpcPropertyField[] {
  const nextFields: NpcPropertyField[] = [];

  for (const attribute of descriptor.Attributes ?? []) {
    const propertyPath = `${fieldPath}.${attribute.Name}`;
    const hasRawValue = source ? Object.prototype.hasOwnProperty.call(source, attribute.Name) : false;
    const rawValue = hasRawValue ? source?.[attribute.Name] : undefined;
    const defaultValue = !hasRawValue && seedDefaults ? parseDescriptorDefaultValue(attribute) : undefined;
    const shouldBeSet =
      hasRawValue ||
      (seedDefaults && (attribute.Required === "REQUIRED" || defaultValue !== undefined));

    nextFields.push(
      createStructuredAttributeField({
        descriptor,
        attribute,
        fieldPath: propertyPath,
        value: hasRawValue ? rawValue : defaultValue,
        descriptors,
        isSet: shouldBeSet,
        seedDefaults,
      }),
    );
  }

  return nextFields;
}

function createStructuredAttributeField({
  descriptor,
  attribute,
  fieldPath,
  value,
  descriptors,
  isSet,
  seedDefaults,
}: {
  descriptor: NpcDescriptor;
  attribute: NpcDescriptorAttribute;
  fieldPath: string;
  value: unknown;
  descriptors: NpcDescriptorDocument;
  isSet: boolean;
  seedDefaults: boolean;
}): NpcPropertyField {
  const domain = typeof attribute.Domain === "string" ? attribute.Domain : undefined;
  const label =
    attribute.Name === "Action" && domain === "Action"
      ? "Inline Action"
      : humanize(attribute.Name) ?? attribute.Name;

  if (attribute.Type === "ObjectRef" && domain) {
    if (isContentWrapperShape(value)) {
      return createRawJsonFallbackStructuredField({
        key: attribute.Name,
        label,
        fieldPath,
        value,
        description:
          toOptionalDisplayString(attribute.ShortDescription) ??
          toOptionalDisplayString(attribute.LongDescription),
        canUnset: true,
        isSet,
      });
    }

    if (domain === "ActionList") {
      return createRichObjectArrayField({
        key: attribute.Name,
        label,
        fieldPath,
        shapeKey: "ActionList",
        itemShapeKey: "Action",
        value,
        descriptors,
        description:
          toOptionalDisplayString(attribute.ShortDescription) ??
          toOptionalDisplayString(attribute.LongDescription),
        canUnset: true,
        isSet,
        seedDefaults,
      });
    }

    if (isSupportedRichObjectShape(domain, descriptors)) {
      return createRichObjectField({
        key: attribute.Name,
        label,
        fieldPath,
        shapeKey: domain,
        value,
        descriptors,
        description:
          toOptionalDisplayString(attribute.ShortDescription) ??
          toOptionalDisplayString(attribute.LongDescription),
        canUnset: true,
        isSet,
      });
    }
  }

  if (attribute.Type === "Array" && domain && isSupportedStructuredArrayDomain(domain, descriptors)) {
    return createRichObjectArrayField({
      key: attribute.Name,
      label,
      fieldPath,
      shapeKey: `${domain}List`,
      itemShapeKey: domain,
      value,
      descriptors,
      description:
        toOptionalDisplayString(attribute.ShortDescription) ??
        toOptionalDisplayString(attribute.LongDescription),
      canUnset: true,
      isSet,
      seedDefaults,
    });
  }

  const fallbackShape =
    value === undefined
      ? inferFieldShapeFromDescriptor(attribute)
      : parseStructuredFieldShape(value, attribute);

  return {
    id: createStructuredFieldId(fieldPath),
    key: attribute.Name,
    label,
    fieldPath,
    kind: fallbackShape.kind,
    value: fallbackShape.value,
    description:
      toOptionalDisplayString(attribute.ShortDescription) ??
      toOptionalDisplayString(attribute.LongDescription),
    required: attribute.Required === "REQUIRED",
    isSet,
    computable: attribute.Computable === true,
    canRename: false,
    canChangeType: false,
    canUnset: true,
    isDescriptionEditable: false,
    itemType: fallbackShape.itemType,
    stateAutocompleteKind: resolveStructuredStateAutocompleteKind(descriptor, attribute, fieldPath),
    animationAutocompleteKind: resolveStructuredAnimationAutocompleteKind(descriptor, attribute),
    staticSuggestions: parseStaticSuggestions(attribute),
    symbolRef: resolveFieldSymbolRef(attribute),
    ui: {},
  };
}

function resolveStructuredStateAutocompleteKind(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: Pick<NpcDescriptorAttribute, "Name">,
  fieldPath: string,
): NpcStateAutocompleteKind | undefined {
  if (attribute.Name !== "State") {
    return undefined;
  }

  if (descriptor.Category === "Action" && descriptor.Name === "ParentState") {
    return "component-parent-alias";
  }

  if (
    (descriptor.Category === "Action" || descriptor.Category === "Sensor") &&
    descriptor.Name === "State"
  ) {
    return fieldPath.startsWith("Content.") || fieldPath === "Content.State"
      ? "component-local"
      : "role-full";
  }

  return undefined;
}

function resolveStructuredAnimationAutocompleteKind(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: Pick<NpcDescriptorAttribute, "Name">,
): NpcAnimationAutocompleteKind | undefined {
  if (attribute.Name !== "Animation") {
    return undefined;
  }

  if (
    (descriptor.Category === "Action" && descriptor.Name === "PlayAnimation") ||
    (descriptor.Category === "Sensor" && descriptor.Name === "Animation")
  ) {
    return "appearance-model";
  }

  return undefined;
}

function seedSpecialRichObjectDefaults(
  field: NpcPropertyField,
  descriptors: NpcDescriptorDocument,
) {
  if (field.kind !== "richObject" || field.shapeKey !== "Action") {
    return;
  }

  const actionsField = field.childFields?.find(childField => childField.key === "Actions");
  if (!actionsField || actionsField.kind !== "richObject" || actionsField.structureKind !== "array") {
    return;
  }

  if (field.variantType === "Random" && (actionsField.childFields?.length ?? 0) === 0) {
    addRichObjectArrayItem(actionsField, descriptors);
  }
}

function seedStructuredArrayItemDefaults(
  parentField: NpcPropertyField,
  itemField: NpcPropertyField,
  descriptors: NpcDescriptorDocument,
) {
  if (
    parentField.kind !== "richObject" ||
    parentField.structureKind !== "array" ||
    !parentField.itemShapeKey ||
    itemField.kind !== "richObject"
  ) {
    return;
  }

  if (parentField.itemShapeKey === "Action") {
    setRichObjectVariantType(itemField, "Timeout", descriptors);
    return;
  }

  if (parentField.itemShapeKey === "MotionController") {
    setRichObjectVariantType(itemField, "Walk", descriptors);
    return;
  }

  if (parentField.itemShapeKey === "WeightedAction") {
    const actionField = itemField.childFields?.find(childField => childField.key === "Action");
    if (actionField?.kind === "richObject") {
      actionField.isSet = true;
      seedInlineActionField(actionField, descriptors);
    }

    const weightField = itemField.childFields?.find(childField => childField.key === "Weight");
    if (weightField && weightField.value.kind === "literal") {
      weightField.isSet = true;
      weightField.value = { kind: "literal", value: 1 };
    }
  }
}

function seedInlineActionField(field: NpcPropertyField, descriptors: NpcDescriptorDocument) {
  if (!setRichObjectVariantType(field, "State", descriptors)) {
    return;
  }

  const stateField = field.childFields?.find(childField => childField.key === "State");
  if (stateField) {
    stateField.isSet = true;
    stateField.value = { kind: "literal", value: "Idle" };
  }
}

function createStructuredFieldId(fieldPath: string): string {
  return `structured-${fieldPath.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function formatStructuredArrayItemLabel(
  itemShapeKey: string,
  index: number,
  variantType?: string,
): string {
  const displayType = variantType || humanize(itemShapeKey) || itemShapeKey;
  return `${displayType} ${index + 1}`;
}

function resolveNamedDescriptor(
  category: string,
  name: string,
  descriptors: NpcDescriptorDocument,
): NpcDescriptor | undefined {
  return descriptors.find(
    descriptor => descriptor.Category === category && descriptor.Name === name,
  );
}

function resolveFixedShapeDescriptor(
  shapeKey: string,
  descriptors: NpcDescriptorDocument,
): NpcDescriptor | undefined {
  return resolveNamedDescriptor(shapeKey, shapeKey, descriptors);
}

function isSupportedRichObjectShape(
  shapeKey: string,
  descriptors: NpcDescriptorDocument,
): boolean {
  return TYPED_RICH_OBJECT_SHAPES.has(shapeKey) || resolveFixedShapeDescriptor(shapeKey, descriptors) !== undefined;
}

function isSupportedStructuredArrayDomain(
  domain: string,
  descriptors: NpcDescriptorDocument,
): boolean {
  return isSupportedRichObjectShape(domain, descriptors);
}

function parseDescriptorDefaultValue(attribute: NpcDescriptorAttribute): unknown {
  const defaultValue = attribute.DefaultValue;
  if (typeof defaultValue !== "string" || !defaultValue.trim()) {
    return undefined;
  }

  switch (attribute.Type) {
    case "Boolean":
      return defaultValue === "true";
    case "Integer":
    case "Double": {
      const nextValue = Number(defaultValue);
      return Number.isFinite(nextValue) ? nextValue : undefined;
    }
    case "Asset":
    case "Enum":
    case "Flag":
    case "String":
      return defaultValue;
    case "Array":
    case "AssetArray":
      try {
        const parsed = JSON.parse(defaultValue);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    default:
      return undefined;
  }
}

function resolveFieldSymbolRef(
  descriptorAttribute?: NpcDescriptorAttribute,
): IndexReference | undefined {
  return resolveNpcDescriptorAssetSymbolLookup(descriptorAttribute);
}

function parseStaticSuggestions(
  descriptorAttribute?: NpcDescriptorAttribute,
): string[] | undefined {
  const rawFlagDescriptions = descriptorAttribute?.FlagDescriptions;
  if (!isRecord(rawFlagDescriptions)) {
    return undefined;
  }

  const values = Object.keys(rawFlagDescriptions).map(normalizeFlagValue);
  return values.length > 0 ? values : undefined;
}

function inferFieldShapeFromDescriptor(
  descriptorAttribute?: NpcDescriptorAttribute,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  const descriptorType = descriptorAttribute?.Type;
  const normalizedDomain = normalizeTypeHint(descriptorAttribute?.Domain);

  switch (descriptorType) {
    case "Boolean":
      return {
        kind: "boolean",
        value: { kind: "literal", value: false },
      };
    case "Integer":
    case "Double":
      return {
        kind: "number",
        value: { kind: "literal", value: 0 },
      };
    case "AssetArray":
      return {
        kind: "list",
        value: { kind: "literal", value: [] },
        itemType: "string",
      };
    case "Array":
      return {
        kind: "list",
        value: { kind: "literal", value: [] },
        itemType: normalizedDomain ?? "string",
      };
    case "Asset":
    case "Enum":
    case "Flag":
    case "String":
      return {
        kind: "string",
        value: { kind: "literal", value: "" },
      };
    default:
      return {
        kind: "rawJson",
        value: { kind: "literal", value: {} },
      };
  }
}

function parseStructuredFieldShape(
  value: unknown,
  descriptorAttribute?: NpcDescriptorAttribute,
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (isNpcComputeJson(value)) {
    const fallbackShape = inferFieldShapeFromDescriptor(descriptorAttribute);
    return {
      kind: fallbackShape.kind,
      value: {
        kind: "compute",
        expression: value.Compute,
      },
      itemType: fallbackShape.itemType,
    };
  }

  return inferLiteralFieldShape(value);
}

function inferLiteralFieldShape(
  value: unknown,
  fallbackItemType?: "string" | "number" | "boolean",
): Pick<NpcPropertyField, "kind" | "value" | "itemType"> {
  if (typeof value === "boolean") {
    return {
      kind: "boolean",
      value: { kind: "literal", value },
    };
  }

  if (typeof value === "number") {
    return {
      kind: "number",
      value: { kind: "literal", value },
    };
  }

  if (typeof value === "string") {
    return {
      kind: "string",
      value: { kind: "literal", value },
    };
  }

  if (Array.isArray(value) && value.every(isPrimitiveListItem)) {
    return {
      kind: "list",
      value: { kind: "literal", value: cloneJsonLike(value) },
      itemType: inferItemTypeFromPrimitiveList(value) ?? fallbackItemType ?? "string",
    };
  }

  if (Array.isArray(value) && value.length === 0) {
    return {
      kind: "list",
      value: { kind: "literal", value: [] },
      itemType: fallbackItemType ?? "string",
    };
  }

  return {
    kind: "rawJson",
    value: { kind: "literal", value: cloneJsonLike(value) },
  };
}
